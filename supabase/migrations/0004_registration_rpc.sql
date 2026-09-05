-- Registration through a single definer function — and the end of anonymous
-- table access.
--
-- 0003 opened `select using (true)` on person, subject and health_intake so the
-- sign-up form could work. It did work, and it also made every registrant's
-- name, phone, email, date of birth, gender and pincode readable by anyone: the
-- publishable key ships in the browser bundle, so row-level security is the only
-- thing standing in front of this data. The count was six people.
--
-- The read policy was never what the form needed. The form needed
-- `insert ... returning id`, and PostgREST implements `returning` as a SELECT,
-- so the row came back through the read policy. Hence a read policy where an
-- insert policy was meant.
--
-- The fix is not a narrower read policy but no anonymous table access at all.
-- `register_member` runs as its owner, does the whole sign-up in one
-- transaction, and returns only the ids it created. The tables go back to
-- default-deny, which is where 0001 left them.

begin;

-- ── 1. Undo 0003 ─────────────────────────────────────────────────────────────

drop policy if exists person_self_read on person;
drop policy if exists person_self_insert on person;
drop policy if exists subject_self_select on subject;
drop policy if exists subject_self_insert on subject;
drop policy if exists health_intake_self_insert on health_intake;
drop policy if exists consent_self_insert on consent_record;

-- 0001's policies, restored verbatim. A person sees their own row and nothing
-- else; there is no policy granting anyone read access across people.
create policy person_self_read on person
  for select using (
    auth_user_id is not null and auth.uid() = auth_user_id
  );

create policy person_self_insert on person
  for insert with check (
    auth_user_id is not null and auth.uid() = auth_user_id
  );

create policy subject_self on subject
  for all using (
    person_id in (
      select id from person
      where auth_user_id is not null and auth_user_id = auth.uid()
    )
  );

create policy health_intake_self_insert on health_intake
  for insert with check (
    subject_id in (
      select s.id from subject s
      join person p on p.id = s.person_id
      where p.auth_user_id is not null and p.auth_user_id = auth.uid()
    )
  );

create policy consent_self_insert on consent_record
  for insert with check (
    person_id in (
      select id from person
      where auth_user_id is not null and auth_user_id = auth.uid()
    )
  );

-- Belt and braces. Supabase grants `anon` full table privileges on everything in
-- `public` by default, and those grants are what RLS then filters. With no
-- policy that admits `anon`, the grants are already inert — but revoking them
-- means a future migration cannot reopen this by accident, only on purpose.
revoke all on person, subject, health_intake, consent_record from anon;

-- ── 2. Registration ──────────────────────────────────────────────────────────

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
  -- Server-side validation. The browser checks the same things for the sake of
  -- good error messages; this is the check that actually holds, because the
  -- REST endpoint is reachable without ever loading the page.
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

  if v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
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

  -- A signed-in visitor's row is bound to their auth user. An anonymous one is
  -- not, and is claimed later when they set a password.
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
    -- Deliberately vague about which field matched. Naming it would turn this
    -- endpoint into a way to test whether a given phone number or email address
    -- belongs to someone we have registered.
    return jsonb_build_object('ok', false, 'field', 'contact',
      'message', 'You are already on our list — there is nothing more to do.');
  when check_violation then
    return jsonb_build_object('ok', false, 'field', 'form',
      'message', 'Some of those details did not look right. Please check and try again.');
end;
$fn$;

comment on function register_member (jsonb) is
  'The only way in for an anonymous visitor. Runs as owner so the tables stay default-deny, validates server-side because the REST endpoint is reachable without the page, and returns ids only — never a row.';

revoke all on function register_member (jsonb) from public;
grant execute on function register_member (jsonb) to anon, authenticated;

commit;
