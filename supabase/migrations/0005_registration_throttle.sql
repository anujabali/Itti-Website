-- Rate-limiting for registration.
--
-- `register_member` is reachable by anyone with the publishable key, which is
-- everyone. It is much harder to abuse than the open inserts it replaced —
-- validated, one row per call, no reads — but nothing stopped a script calling
-- it in a loop and filling the table with plausible-looking people. Cleaning
-- that up afterwards means telling real registrants apart from invented ones,
-- which is not a thing you can do reliably after the fact.
--
-- The limit is per client address per hour. It fails OPEN: if the address
-- cannot be read, the registration proceeds. A rate limiter that blocks real
-- people when it malfunctions is worse than the spam it prevents.

begin;

-- A salt, so the throttle table holds no recoverable addresses. Without one,
-- md5/sha256 of an IPv4 address is reversible by trying all four billion.
create table if not exists app_secret (
  key text primary key,
  value text not null
);

alter table app_secret enable row level security;
-- No policies at all: only definer functions, which bypass RLS, can read this.
revoke all on app_secret from anon, authenticated;

insert into app_secret (key, value)
values ('throttle_salt', gen_random_uuid()::text)
on conflict (key) do nothing;

create table if not exists registration_throttle (
  bucket text not null,           -- sha256(address + salt), never the address
  window_start timestamptz not null,
  attempts integer not null default 1,
  primary key (bucket, window_start)
);

alter table registration_throttle enable row level security;
revoke all on registration_throttle from anon, authenticated;

create index if not exists registration_throttle_window_idx
  on registration_throttle (window_start);

comment on table registration_throttle is
  'Per-hour registration counts, keyed by a salted hash of the client address. Holds no address and is pruned to the last day.';

-- ── The check ────────────────────────────────────────────────────────────────

create or replace function registration_within_rate_limit ()
  returns boolean
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $fn$
declare
  v_limit constant integer := 10;   -- per address per hour
  v_ip      text;
  v_salt    text;
  v_bucket  text;
  v_window  timestamptz := date_trunc('hour', now());
  v_count   integer;
begin
  -- PostgREST exposes the request headers; the proxy in front of it sets
  -- x-forwarded-for. Either may be absent, in which case we do not throttle.
  begin
    v_ip := nullif(
      btrim(split_part(
        coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''),
        ',', 1)),
      '');
  exception when others then
    v_ip := null;
  end;

  if v_ip is null then
    return true;
  end if;

  select value into v_salt from app_secret where key = 'throttle_salt';
  if v_salt is null then
    return true;
  end if;

  v_bucket := encode(sha256((v_ip || v_salt)::bytea), 'hex');

  insert into registration_throttle (bucket, window_start, attempts)
  values (v_bucket, v_window, 1)
  on conflict (bucket, window_start)
    do update set attempts = registration_throttle.attempts + 1
  returning attempts into v_count;

  -- Opportunistic pruning, so the table cannot grow without bound and holds
  -- nothing older than it needs.
  if random() < 0.01 then
    delete from registration_throttle where window_start < now() - interval '1 day';
  end if;

  return v_count <= v_limit;
end;
$fn$;

revoke all on function registration_within_rate_limit () from public;

-- ── Wire it into registration ────────────────────────────────────────────────
-- Checked after validation, so that correcting a typo and resubmitting does not
-- count against the limit, and before the insert, so a refusal writes nothing.

create or replace function register_member (payload jsonb)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $fn$
declare
  v_name    text := btrim(payload ->> 'fullName');
  v_city    text := btrim(payload ->> 'city');
  v_role    text := payload ->> 'role';
  v_phone   text := nullif(btrim(payload ->> 'phone'), '');
  v_email   text := nullif(lower(btrim(payload ->> 'email')), '');
  v_pincode text := nullif(btrim(payload ->> 'pincode'), '');
  v_gender  text := nullif(payload ->> 'gender', '');
  v_pillar  text := nullif(payload ->> 'selectedPillar', '');
  v_heard   text := nullif(payload ->> 'heardFrom', '');
  v_dob     date;
  v_policy  text := coalesce(nullif(payload ->> 'policyVersion', ''), 'v1.0');
  v_auth    uuid := auth.uid();
  v_person  uuid;
  v_subject uuid;
begin
  if v_name is null or length(v_name) < 1 or length(v_name) > 120 then
    return jsonb_build_object('ok', false, 'field', 'fullName',
      'message', 'Please enter your full name.');
  end if;

  if v_city is null or length(v_city) < 1 or length(v_city) > 100 then
    return jsonb_build_object('ok', false, 'field', 'city',
      'message', 'Please enter your city.');
  end if;

  if v_role is null or v_role not in ('patient', 'caregiver', 'volunteer', 'other') then
    return jsonb_build_object('ok', false, 'field', 'role',
      'message', 'Please select a role.');
  end if;

  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    return jsonb_build_object('ok', false, 'field', 'phone',
      'message', 'Please enter a valid number with country code.');
  end if;

  if v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' then
    return jsonb_build_object('ok', false, 'field', 'email',
      'message', 'Please enter a valid email address.');
  end if;

  if v_phone is null and v_email is null then
    return jsonb_build_object('ok', false, 'field', 'contact',
      'message', 'Please give us either a phone number or an email address.');
  end if;

  if v_pincode is not null and v_pincode !~ '^[1-9][0-9]{5}$' then
    return jsonb_build_object('ok', false, 'field', 'pincode',
      'message', 'A PIN code is six digits.');
  end if;

  if v_gender is not null
     and v_gender not in ('woman', 'man', 'non_binary', 'self_described', 'undisclosed') then
    return jsonb_build_object('ok', false, 'field', 'gender',
      'message', 'Please choose one of the listed options.');
  end if;

  if v_pillar is not null
     and v_pillar not in ('neurodivergence', 'cancer_care', 'claw', 'not_sure', 'other') then
    return jsonb_build_object('ok', false, 'field', 'selectedPillar',
      'message', 'Please choose one of the listed areas.');
  end if;

  begin
    v_dob := nullif(payload ->> 'dateOfBirth', '')::date;
  exception when others then
    return jsonb_build_object('ok', false, 'field', 'dateOfBirth',
      'message', 'Please enter a valid date of birth.');
  end;

  if v_dob is not null
     and (v_dob > current_date or v_dob <= current_date - interval '120 years') then
    return jsonb_build_object('ok', false, 'field', 'dateOfBirth',
      'message', 'Please enter a valid date of birth.');
  end if;

  if not registration_within_rate_limit() then
    return jsonb_build_object('ok', false, 'field', 'form',
      'message', 'That is a lot of registrations from one place. Please try again later, or write to us and we will help.');
  end if;

  insert into person (
    auth_user_id, full_name, city, role, phone, email,
    date_of_birth, gender, gender_self_described, pincode, preferred_language,
    contact_preferred, consent_whatsapp, consent_sms, consent_email,
    heard_from, heard_from_other, referrer_name, referrer_code, utm
  ) values (
    v_auth, v_name, v_city, v_role::role_kind, v_phone, v_email,
    v_dob, v_gender::gender_kind,
    case when v_gender = 'self_described'
      then nullif(btrim(payload ->> 'genderSelfDescribed'), '') end,
    v_pincode,
    nullif(payload ->> 'preferredLanguage', ''),
    nullif(payload ->> 'preferredContactChannel', '')::contact_channel,
    (payload ->> 'consentWhatsapp')::boolean,
    (payload ->> 'consentSms')::boolean,
    (payload ->> 'consentEmail')::boolean,
    v_heard::heard_from,
    case when v_heard = 'other'
      then nullif(btrim(payload ->> 'heardFromOther'), '') end,
    nullif(btrim(payload ->> 'referrerName'), ''),
    nullif(btrim(payload ->> 'referrerCode'), ''),
    coalesce(payload -> 'utm', '{}'::jsonb)
  )
  returning id into v_person;

  if v_pillar is not null then
    insert into subject (person_id, relationship)
    values (v_person, 'self')
    returning id into v_subject;

    insert into health_intake (subject_id, pillar, modalities, source)
    values (v_subject, v_pillar::pillar_kind, '{}', 'self');
  end if;

  insert into consent_record (person_id, purpose, granted, policy_version, channel, granted_by)
  select v_person, purpose, true, v_policy, 'web', v_auth
  from (values ('account')) as t (purpose)
  union all
  select v_person, 'whatsapp', true, v_policy, 'web', v_auth
    where (payload ->> 'consentWhatsapp')::boolean is true
  union all
  select v_person, 'sms', true, v_policy, 'web', v_auth
    where (payload ->> 'consentSms')::boolean is true
  union all
  select v_person, 'email', true, v_policy, 'web', v_auth
    where (payload ->> 'consentEmail')::boolean is true;

  return jsonb_build_object('ok', true, 'personId', v_person, 'subjectId', v_subject);

exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'field', 'contact',
      'message', 'You are already on our list — there is nothing more to do.');
  when check_violation then
    return jsonb_build_object('ok', false, 'field', 'form',
      'message', 'Some of those details did not look right. Please check and try again.');
end;
$fn$;

revoke all on function register_member (jsonb) from public;
grant execute on function register_member (jsonb) to anon, authenticated;

commit;
