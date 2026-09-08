-- The welcome message shows people what we wrote down
--
-- The receipt said "we have your details" and left it at that, which gives
-- nobody a way to notice that a digit of their number is wrong or that the city
-- autocompleted to the wrong one. Everything they typed now travels with the
-- notification so the message can set it back in front of them.
--
-- It is their own data, going to the address they gave as their own, for the
-- purpose of letting them check it — the same thing every booking confirmation
-- does. Nothing new is stored; the outbox row simply carries more of what the
-- registration already holds.
--
-- Only `register_member` changes, and only the object it builds for the welcome
-- row. The guardian notice is untouched: a guardian is told that a child has
-- registered, not handed the child's contact details.

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
  v_pillars text[];
  v_pillar  text;
  v_heard   text := nullif(payload ->> 'heardFrom', '');
  v_channel text := nullif(payload ->> 'preferredContactChannel', '');
  v_wa      boolean := (payload ->> 'consentWhatsapp')::boolean;
  v_sms     boolean := (payload ->> 'consentSms')::boolean;
  v_mail    boolean := (payload ->> 'consentEmail')::boolean;
  v_gname   text := nullif(btrim(payload ->> 'guardianName'), '');
  v_gphone  text := nullif(btrim(payload ->> 'guardianPhone'), '');
  v_gemail  text := nullif(lower(btrim(payload ->> 'guardianEmail')), '');
  v_dob     date;
  v_policy  text := coalesce(nullif(payload ->> 'policyVersion', ''), 'v1.0');
  v_auth    uuid := auth.uid();
  v_person  uuid;
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

  -- One area or several. `selectedPillar` is still read so that anything built
  -- against the old shape keeps working.
  -- `array(select ... )` over a missing key yields an empty array rather than
  -- null, so coalesce never falls through to the single-value form. The key has
  -- to be tested for directly.
  if payload ? 'selectedPillars' then
    v_pillars := array(select jsonb_array_elements_text(payload -> 'selectedPillars'));
  elsif nullif(payload ->> 'selectedPillar', '') is not null then
    v_pillars := array[payload ->> 'selectedPillar'];
  else
    v_pillars := '{}'::text[];
  end if;

  v_pillars := array(select distinct unnest(v_pillars));

  foreach v_pillar in array v_pillars loop
    if v_pillar not in ('neurodivergence', 'cancer_care', 'claw', 'not_sure', 'other') then
      return jsonb_build_object('ok', false, 'field', 'selectedPillars',
        'message', 'Please choose from the listed areas.');
    end if;
  end loop;

  -- "Not sure yet" is an answer on its own, not one to hold alongside others.
  if array_length(v_pillars, 1) > 1 then
    v_pillars := array_remove(v_pillars, 'not_sure');
  end if;

  if v_heard is not null and v_heard not in (
    'friend_family', 'doctor_hospital', 'event', 'podcast', 'instagram',
    'youtube', 'whatsapp_group', 'search', 'news', 'volunteer_staff', 'other'
  ) then
    return jsonb_build_object('ok', false, 'field', 'heardFrom',
      'message', 'Please choose one of the listed options.');
  end if;

  -- A preferred channel nobody was ever asked for. If exactly one contact
  -- permission was given, that is the preference; more than one states none.
  if v_channel is null then
    v_channel := case
      when v_wa is true and v_sms is not true and v_mail is not true then 'whatsapp'
      when v_sms is true and v_wa is not true and v_mail is not true then 'sms'
      when v_mail is true and v_wa is not true and v_sms is not true then 'email'
    end;
  elsif v_channel not in ('whatsapp', 'sms', 'email', 'push') then
    return jsonb_build_object('ok', false, 'field', 'preferredContactChannel',
      'message', 'Please choose one of the listed options.');
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
      v_channel::contact_channel,
      v_wa,
      v_sms,
      v_mail,
      v_heard::heard_from,
      case when v_heard = 'other'
        then nullif(btrim(payload ->> 'heardFromOther'), '') end,
      nullif(btrim(payload ->> 'referrerName'), ''),
      nullif(btrim(payload ->> 'referrerCode'), ''),
      coalesce(payload -> 'utm', '{}'::jsonb),
      v_gname, v_gphone, v_gemail
    )
    returning id into v_person;

    if array_length(v_pillars, 1) > 0 then
      insert into person_interest (person_id, pillar)
      select v_person, p::pillar_kind from unnest(v_pillars) as p
      on conflict do nothing;
    end if;

    insert into consent_record (person_id, purpose, granted, policy_version, channel, granted_by)
    select v_person, purpose, true, v_policy, 'web', v_auth
    from (values ('account')) as t (purpose)
    union all
    select v_person, 'guardian', true, v_policy, 'web', v_auth
      where v_gphone is not null or v_gemail is not null
    union all
    select v_person, 'whatsapp', true, v_policy, 'web', v_auth
      where v_wa is true
    union all
    select v_person, 'sms', true, v_policy, 'web', v_auth
      where v_sms is true
    union all
    select v_person, 'email', true, v_policy, 'web', v_auth
      where v_mail is true;

  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'field', 'contact',
        'message', 'You are already on our list — there is nothing more to do.');
    when check_violation then
      return jsonb_build_object('ok', false, 'field', 'form',
        'message', 'Some of those details did not look right. Please check and try again.');
  end;

  -- What we owe this person, written in the same transaction as the record it
  -- acknowledges. Sending happens elsewhere, so a mail outage cannot fail a
  -- registration and an acknowledgement cannot be lost by one.
  insert into notification (person_id, kind, to_address, status, last_error, payload)
  values (
    v_person,
    'welcome',
    coalesce(v_email, ''),
    case when v_email is null then 'skipped' else 'pending' end,
    case when v_email is null then 'no email address given' end,
    jsonb_build_object(
      'firstName', split_part(v_name, ' ', 1),
      'fullName', v_name,
      'interests', to_jsonb(v_pillars),
      'isMinor', v_dob is not null and v_dob > current_date - interval '18 years',
      -- Everything they typed, so the message can show it back to them. A
      -- receipt that says "we have your details" gives nobody a way to notice
      -- that a digit of their number is wrong.
      'city', v_city,
      'role', v_role,
      'phone', coalesce(v_phone, ''),
      'email', coalesce(v_email, ''),
      'pincode', coalesce(v_pincode, ''),
      'dateOfBirth', case when v_dob is null then '' else to_char(v_dob, 'DD Mon YYYY') end,
      'gender', coalesce(v_gender, ''),
      -- The free-text halves travel too. "Self-described" and "Somewhere else"
      -- are the form's bookkeeping; the answer is what they typed beside them.
      'genderOther', coalesce(nullif(btrim(payload ->> 'genderSelfDescribed'), ''), ''),
      'language', coalesce(nullif(payload ->> 'preferredLanguage', ''), ''),
      'heardFrom', coalesce(v_heard, ''),
      'heardOther', coalesce(nullif(btrim(payload ->> 'heardFromOther'), ''), ''),
      'guardianName', coalesce(v_gname, ''),
      'guardianEmail', coalesce(v_gemail, ''),
      'guardianPhone', coalesce(v_gphone, ''),
      'consentWhatsapp', coalesce(v_wa, false),
      'consentSms', coalesce(v_sms, false),
      'consentEmail', coalesce(v_mail, false)
    )
  )
  on conflict (person_id, kind) do nothing;

  -- A guardian reachable only by phone still gets a row, marked skipped. The
  -- privacy page undertakes that somebody contacts them before the
  -- registration is acted on; there is no SMS sender, so that has to be a
  -- number someone can count rather than an absence nobody sees.
  if v_gphone is not null or v_gemail is not null then
    insert into notification (person_id, kind, to_address, status, last_error, payload)
    values (
      v_person,
      'guardian_notice',
      coalesce(v_gemail, ''),
      case when v_gemail is null then 'skipped' else 'pending' end,
      case when v_gemail is null then 'guardian given by phone; no SMS sender' end,
      jsonb_build_object(
        'guardianName', coalesce(v_gname, ''),
        'guardianPhone', coalesce(v_gphone, ''),
        'childName', v_name,
        'interests', to_jsonb(v_pillars)
      )
    )
    on conflict (person_id, kind) do nothing;
  end if;

  return jsonb_build_object(
    'ok', true,
    'personId', v_person,
    'interests', to_jsonb(v_pillars)
  );
end;
$fn$;

revoke all on function register_member (jsonb) from public;
grant execute on function register_member (jsonb) to anon, authenticated;

commit;
