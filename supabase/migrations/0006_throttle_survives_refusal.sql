-- The rate limit never counted anything.
--
-- `register_member` carried one exception handler around its whole body. A
-- PL/pgSQL block with an exception handler runs as a subtransaction, so when
-- the person insert raised unique_violation — the ordinary case of somebody
-- already being registered — everything the function had done rolled back with
-- it, including the row it had just written to `registration_throttle`.
--
-- The effect was that the limit counted successful registrations only. Anyone
-- hammering the endpoint with an address already on file, which is the cheapest
-- way to hammer it, was never counted at all.
--
-- The handler now wraps only the writes. The throttle increment happens outside
-- it and survives a refusal, which is the whole point of counting attempts
-- rather than successes.

begin;

-- The diagnostics used to find this. They returned the caller's own request
-- headers, which is harmless but has no business staying reachable.
drop function if exists _diag_headers ();
drop function if exists _diag_throttle ();
drop function if exists _diag_rollback ();
delete from registration_throttle where bucket = 'diag';

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

  -- Counted before the writes and outside their exception block, so a refusal
  -- still costs the caller an attempt.
  if not registration_within_rate_limit() then
    return jsonb_build_object('ok', false, 'field', 'form',
      'message', 'That is a lot of registrations from one place. Please try again later, or write to us and we will help.');
  end if;

  -- The writes, and only the writes, under a handler. If any of them fails the
  -- whole registration rolls back together — but the attempt above stands.
  begin
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

  exception
    when unique_violation then
      -- Deliberately vague about which field matched, so the endpoint cannot be
      -- used to test whether a number or address is on file.
      return jsonb_build_object('ok', false, 'field', 'contact',
        'message', 'You are already on our list — there is nothing more to do.');
    when check_violation then
      return jsonb_build_object('ok', false, 'field', 'form',
        'message', 'Some of those details did not look right. Please check and try again.');
  end;

  return jsonb_build_object('ok', true, 'personId', v_person, 'subjectId', v_subject);
end;
$fn$;

revoke all on function register_member (jsonb) from public;
grant execute on function register_member (jsonb) to anon, authenticated;

commit;
