-- A guardian's contact, when the registrant is under 18.
--
-- 0001 wrote `person_is_minor()` and a comment saying the DPDP Act sets the
-- threshold at 18 and requires verifiable consent from a parent or guardian.
-- Nothing ever acted on it: the form accepted any date of birth and asked
-- nothing further.
--
-- This is not verifiable consent by itself. It is the contact that makes
-- verification possible — the foundation still has to reach the guardian and
-- confirm. What it does close is the case of having no way to.

begin;

alter table person
  add column if not exists guardian_name text
    check (guardian_name is null or length(btrim(guardian_name)) between 1 and 120),
  add column if not exists guardian_phone text
    check (guardian_phone is null or guardian_phone ~ '^\+[1-9][0-9]{7,14}$'),
  -- Schema-qualified: 0008 moved citext out of `public`, so it is no longer on
  -- the migration runner's search_path.
  add column if not exists guardian_email extensions.citext;

comment on column person.guardian_phone is
  'Reachable contact for the parent or guardian of a registrant under 18. Required, along with or instead of guardian_email, when date_of_birth is under 18 — enforced in register_member rather than by a check constraint, because a constraint on current_date is not re-evaluated for rows that already exist and would make every minor row invalid on restore.';

create index if not exists person_guardian_idx on person (guardian_phone, guardian_email)
  where guardian_phone is not null or guardian_email is not null;

-- ── Registration enforces it ────────────────────────────────────────────────

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
  v_gname   text := nullif(btrim(payload ->> 'guardianName'), '');
  v_gphone  text := nullif(btrim(payload ->> 'guardianPhone'), '');
  v_gemail  text := nullif(lower(btrim(payload ->> 'guardianEmail')), '');
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

  -- Under 18: a guardian has to be reachable.
  if v_dob is not null and v_dob > current_date - interval '18 years' then
    if v_gphone is not null and v_gphone !~ '^\+[1-9][0-9]{7,14}$' then
      return jsonb_build_object('ok', false, 'field', 'guardianPhone',
        'message', 'Please enter a valid number with country code.');
    end if;

    if v_gemail is not null
       and v_gemail !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' then
      return jsonb_build_object('ok', false, 'field', 'guardianEmail',
        'message', 'Please enter a valid email address.');
    end if;

    if v_gphone is null and v_gemail is null then
      return jsonb_build_object('ok', false, 'field', 'guardianContact',
        'message', 'Because you are under 18, we need a way to reach your parent or guardian.');
    end if;
  else
    -- Not a minor: guardian details are not kept, whatever was sent.
    v_gname := null;
    v_gphone := null;
    v_gemail := null;
  end if;

  if not registration_within_rate_limit() then
    return jsonb_build_object('ok', false, 'field', 'form',
      'message', 'That is a lot of registrations from one place. Please try again later, or write to us and we will help.');
  end if;

  begin
    insert into person (
      auth_user_id, full_name, city, role, phone, email,
      date_of_birth, gender, gender_self_described, pincode, preferred_language,
      contact_preferred, consent_whatsapp, consent_sms, consent_email,
      heard_from, heard_from_other, referrer_name, referrer_code, utm,
      guardian_name, guardian_phone, guardian_email
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
      coalesce(payload -> 'utm', '{}'::jsonb),
      v_gname, v_gphone, v_gemail
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
    select v_person, 'guardian', true, v_policy, 'web', v_auth
      where v_gphone is not null or v_gemail is not null
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
