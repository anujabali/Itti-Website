-- Saving a chosen colour
--
-- The same writer, taking the one new field. Everything it already validated is
-- untouched, and an unrecognised colour is refused by name rather than stored
-- and rendered as nothing.

begin;

create or replace function update_my_registration (payload jsonb)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $fn$
declare
  v_auth    uuid := auth.uid();
  v_person  uuid;
  v_old     person;
  v_name    text := btrim(payload ->> 'fullName');
  v_city    text := btrim(payload ->> 'city');
  v_role    text := payload ->> 'role';
  v_phone   text := nullif(btrim(payload ->> 'phone'), '');
  v_pincode text := nullif(btrim(payload ->> 'pincode'), '');
  v_gender  text := nullif(payload ->> 'gender', '');
  v_gother  text := nullif(btrim(payload ->> 'genderSelfDescribed'), '');
  v_lang    text := nullif(btrim(payload ->> 'preferredLanguage'), '');
  v_bio     text := nullif(btrim(payload ->> 'bio'), '');
  v_accent  text := nullif(btrim(payload ->> 'accent'), '');
  v_links   jsonb := coalesce(payload -> 'links', '{}'::jsonb);
  v_kind    text;
  v_val     text;
  v_dob     date;
  v_wa      boolean := coalesce((payload ->> 'consentWhatsapp')::boolean, false);
  v_sms     boolean := coalesce((payload ->> 'consentSms')::boolean, false);
  v_mail    boolean := coalesce((payload ->> 'consentEmail')::boolean, false);
  v_policy  text := coalesce(nullif(payload ->> 'policyVersion', ''), 'v1.0');
  v_pillars text[];
begin
  if v_auth is null then
    return jsonb_build_object('ok', false, 'field', 'form',
      'message', 'You are signed out. Sign in again and your changes will save.');
  end if;

  select * into v_old from person where auth_user_id = v_auth;
  if not found then
    return jsonb_build_object('ok', false, 'field', 'form',
      'message', 'We could not find a registration for this account.');
  end if;
  v_person := v_old.id;

  -- The same checks the form makes, made again here, because the form is a
  -- courtesy and this is the boundary.
  if v_name is null or length(v_name) = 0 or length(v_name) > 120 then
    return jsonb_build_object('ok', false, 'field', 'fullName',
      'message', 'Please give the name we should use.');
  end if;

  if v_city is null or length(v_city) = 0 or length(v_city) > 100 then
    return jsonb_build_object('ok', false, 'field', 'city',
      'message', 'Please give a city.');
  end if;

  if v_role is null or v_role not in ('patient', 'caregiver', 'volunteer', 'other') then
    return jsonb_build_object('ok', false, 'field', 'role',
      'message', 'Please choose one of the four.');
  end if;

  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    return jsonb_build_object('ok', false, 'field', 'phone',
      'message', 'That does not look like a phone number we can dial.');
  end if;

  -- Email is the account. A registration reached only by phone would have no
  -- way back in, and this account arrived by email, so the address stays.
  if v_phone is null and v_old.email is null then
    return jsonb_build_object('ok', false, 'field', 'phone',
      'message', 'We need one way to reach you. Please leave a phone number.');
  end if;

  if v_pincode is not null and v_pincode !~ '^[1-9][0-9]{5}$' then
    return jsonb_build_object('ok', false, 'field', 'pincode',
      'message', 'An Indian PIN code is six digits.');
  end if;

  if v_gender is not null
     and v_gender not in ('woman', 'man', 'non_binary', 'self_described', 'undisclosed') then
    return jsonb_build_object('ok', false, 'field', 'gender',
      'message', 'That is not one of the options.');
  end if;

  -- The free-text half belongs to one answer only; the table's own check
  -- enforces it, and a friendly refusal beats a constraint error.
  if v_gender is distinct from 'self_described' then
    v_gother := null;
  end if;

  if nullif(btrim(payload ->> 'dateOfBirth'), '') is not null then
    begin
      v_dob := (payload ->> 'dateOfBirth')::date;
    exception
      when others then
        return jsonb_build_object('ok', false, 'field', 'dateOfBirth',
          'message', 'That date did not read as a date.');
    end;
    if v_dob > current_date or v_dob <= current_date - interval '120 years' then
      return jsonb_build_object('ok', false, 'field', 'dateOfBirth',
        'message', 'Please check the year.');
    end if;
  end if;

  -- A minor's registration was accepted on a guardian's say-so. Editing the
  -- date of birth cannot be a way to remove that condition after the fact.
  if v_dob is not null
     and v_dob > current_date - interval '18 years'
     and v_old.guardian_name is null
     and v_old.guardian_email is null
     and v_old.guardian_phone is null then
    return jsonb_build_object('ok', false, 'field', 'dateOfBirth',
      'message', 'That date makes you under 18, and we need a parent or guardian on the record. Write to hello@itti.org.in and we will sort it out.');
  end if;

  -- The same set registration accepts, and the same rule about "not sure yet":
  -- it is an answer on its own, not one to hold alongside others.
  if v_accent is not null and v_accent not in ('teal', 'ochre', 'rose', 'sage') then
    return jsonb_build_object('ok', false, 'field', 'accent',
      'message', 'That is not one of the four colours.');
  end if;

  if v_bio is not null and length(v_bio) > 600 then
    return jsonb_build_object('ok', false, 'field', 'bio',
      'message', 'That is longer than we can keep. Six hundred characters is the limit.');
  end if;

  -- Every link is checked before anything is written, so a bad handle does not
  -- leave half a profile saved.
  for v_kind, v_val in select key, value from jsonb_each_text(v_links) loop
    if v_kind not in ('instagram','facebook','youtube','linkedin','website','email') then
      return jsonb_build_object('ok', false, 'field', 'links',
        'message', 'We do not know that kind of link.');
    end if;
    v_val := normalise_link(v_kind::link_kind, v_val);
    if v_val is null then
      continue;
    end if;
    if length(v_val) > 200 then
      return jsonb_build_object('ok', false, 'field', v_kind,
        'message', 'That is too long to be a handle.');
    end if;
    if v_kind = 'email' and v_val !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      return jsonb_build_object('ok', false, 'field', 'email_link',
        'message', 'That does not look like an email address.');
    end if;
    if v_kind = 'website' and v_val !~* '^https?://[^[:space:]]+\.[^[:space:]]+$' then
      return jsonb_build_object('ok', false, 'field', 'website',
        'message', 'That does not look like a web address.');
    end if;
    if v_kind in ('instagram','facebook','youtube','linkedin')
       and v_val !~ '^[A-Za-z0-9._@-]{1,100}$' then
      return jsonb_build_object('ok', false, 'field', v_kind,
        'message', 'A handle is letters, numbers, dots, dashes and underscores.');
    end if;
  end loop;

  select coalesce(array_agg(distinct t), '{}')
    into v_pillars
    from jsonb_array_elements_text(coalesce(payload -> 'interests', '[]'::jsonb)) as t
   where t in ('neurodivergence', 'cancer_care', 'claw', 'not_sure', 'other');

  if array_length(v_pillars, 1) > 1 then
    v_pillars := array_remove(v_pillars, 'not_sure');
  end if;

  begin
    update person
       set full_name             = v_name,
           city                  = v_city,
           role                  = v_role::role_kind,
           phone                 = v_phone,
           -- A number they have just changed is a number nobody has verified.
           phone_verified_at     = case when v_phone is distinct from v_old.phone
                                        then null else v_old.phone_verified_at end,
           pincode               = v_pincode,
           date_of_birth         = v_dob,
           gender                = v_gender::gender_kind,
           gender_self_described = v_gother,
           preferred_language    = v_lang,
           bio                   = v_bio,
           accent                = v_accent::accent_kind,
           consent_whatsapp      = v_wa,
           consent_sms           = v_sms,
           consent_email         = v_mail,
           updated_at            = now()
     where id = v_person;
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'field', 'phone',
        'message', 'That number is already on our list against someone else.');
    when check_violation then
      return jsonb_build_object('ok', false, 'field', 'form',
        'message', 'Some of that did not look right. Please check and try again.');
  end;

  -- Sent as a whole, stored as a whole: a kind the page did not send is a kind
  -- the person removed. Only the keys they sent are touched, so a future page
  -- that edits one link cannot silently drop the others it never knew about.
  for v_kind, v_val in select key, value from jsonb_each_text(v_links) loop
    v_val := normalise_link(v_kind::link_kind, v_val);
    if v_val is null then
      delete from person_link where person_id = v_person and kind = v_kind::link_kind;
    else
      insert into person_link (person_id, kind, value)
      values (v_person, v_kind::link_kind, v_val)
      on conflict (person_id, kind) do update
        -- A changed handle is a new claim, so any verification it carried is
        -- no longer about the thing that is stored.
        set value = excluded.value,
            verified_at = case when person_link.value = excluded.value
                            then person_link.verified_at end;
    end if;
  end loop;

  delete from person_interest
   where person_id = v_person
     and pillar::text <> all (v_pillars);

  if array_length(v_pillars, 1) > 0 then
    insert into person_interest (person_id, pillar)
    select v_person, p::pillar_kind from unnest(v_pillars) as p
    on conflict do nothing;
  end if;

  -- Consent is append-only, and only a change is an event. Rewriting the same
  -- answer every time somebody fixes a typo would bury the withdrawals.
  insert into consent_record (person_id, purpose, granted, policy_version, channel, granted_by)
  select v_person, purpose, granted, v_policy, 'web', v_auth
    from (values
      ('whatsapp', v_wa,   coalesce(v_old.consent_whatsapp, false)),
      ('sms',      v_sms,  coalesce(v_old.consent_sms, false)),
      ('email',    v_mail, coalesce(v_old.consent_email, false))
    ) as t (purpose, granted, was)
   where granted is distinct from was;

  return jsonb_build_object('ok', true);
end;
$fn$;



comment on function update_my_registration (jsonb) is
  'Writes back the fields a person may correct about themselves, including their own bio, links and chosen colour.';

revoke all on function update_my_registration (jsonb) from public, anon;
grant execute on function update_my_registration (jsonb) to authenticated;

commit;
