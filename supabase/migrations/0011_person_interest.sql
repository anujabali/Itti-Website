-- An interest is a property of a person, and there can be more than one.
--
-- Registration recorded which of the three areas someone wanted by creating a
-- `subject` and a `health_intake` row to hold a single `pillar`. Two things
-- were wrong with that. `health_intake` is the clinical record Form 2 is meant
-- to fill — the three rows it holds today carry a pillar and nothing else: no
-- ailment, no status, no modalities, no year — and a single column cannot say
-- that somebody is here for both neurodivergence and cancer care, which is an
-- ordinary thing to be here for.
--
-- Interests move to their own table. `health_intake` is left for the intake,
-- and registration stops writing clinical rows for people who have not filled
-- in a clinical form.

begin;

create table if not exists person_interest (
  person_id uuid not null references person (id) on delete cascade,
  pillar pillar_kind not null,
  created_at timestamptz not null default now(),
  primary key (person_id, pillar)
);

comment on table person_interest is
  'Which areas a person asked to be connected with, one row each. Distinct from health_intake, which records a clinical intake and belongs to Form 2.';

create index if not exists person_interest_pillar_idx on person_interest (pillar);

alter table person_interest enable row level security;
revoke all on person_interest from anon;

-- Same rule as everything else here: your own rows, and only when signed in.
create policy person_interest_self on person_interest
  for all using (
    person_id in (
      select id from person
      where auth_user_id is not null and auth_user_id = (select auth.uid())
    )
  );

-- Carry the existing three across, then drop the rows they came from. They
-- hold a pillar and nothing besides, so nothing is lost.
insert into person_interest (person_id, pillar, created_at)
select s.person_id, h.pillar, h.created_at
from health_intake h
join subject s on s.id = h.subject_id
where h.pillar is not null
on conflict do nothing;

delete from health_intake
where pillar is not null
  and ailment_code is null
  and status is null
  and coalesce(array_length(modalities, 1), 0) = 0
  and diagnosis_year is null
  and under_medical_supervision is null;

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
  select coalesce(
           array(select jsonb_array_elements_text(payload -> 'selectedPillars')),
           case when nullif(payload ->> 'selectedPillar', '') is null then '{}'::text[]
                else array[payload ->> 'selectedPillar'] end
         )
    into v_pillars;

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
