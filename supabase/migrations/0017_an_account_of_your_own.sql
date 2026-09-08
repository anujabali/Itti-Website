-- People can sign in and see what we hold about them
--
-- Registration wrote a row and sent a receipt. After that the only way to
-- correct a digit was to reply to an email and wait for somebody to do it by
-- hand. This gives the person the record itself.
--
-- Three functions, and a lock.
--
--   claim_registration()        binds a signed-in account to the registration
--                               that carries the same, confirmed, address
--   my_registration()           returns that record, shaped for reading
--   update_my_registration()    writes back the fields that are theirs to change
--
-- The lock matters as much as the functions. `authenticated` has held INSERT,
-- UPDATE and DELETE on `person` since the schema was created — Supabase grants
-- them by default and RLS only filters which rows they reach. Nobody has been
-- bound to a row until now, so the grant has been unreachable rather than
-- harmless. The moment sign-in exists it becomes reachable, and a person could
-- rewrite their own `email`, `role` or `auth_user_id` directly from the
-- browser. Those grants come off, and every write goes through a function that
-- names the columns it will touch.
--
-- Email is deliberately not among them. It is the address the account signs in
-- with and the address the receipt went to; changing it is an identity change,
-- not a correction, and it goes through a person.

begin;

-- ── 1. Close the direct writes ───────────────────────────────────────────────

-- 0001 created `person_self_write`, which 0004 did not drop. It permits a bound
-- account to update its own row column by column. Everything it allowed is
-- offered below, spelled out.
drop policy if exists person_self_write on person;

-- Registration is a SECURITY DEFINER function and does not need a policy to
-- insert; nothing else inserts a person at all.
drop policy if exists person_self_insert on person;

revoke insert, update, delete, truncate on person from authenticated;
revoke insert, update, delete, truncate on person_interest from authenticated;
revoke insert, update, delete, truncate on consent_record from authenticated;

-- SELECT stays, filtered by `person_self_read` to the caller's own row. It is
-- what makes the functions below auditable from the client rather than a black
-- box, and it can reach nothing else.

-- ── 2. Binding an account to a registration ──────────────────────────────────

create or replace function claim_registration ()
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $fn$
declare
  v_auth   uuid := auth.uid();
  v_email  text;
  v_person uuid;
  v_bound  uuid;
begin
  if v_auth is null then
    return jsonb_build_object('ok', false, 'reason', 'signed_out');
  end if;

  -- The address as the auth system holds it, and only once it has been
  -- confirmed. Read from `auth.users` rather than from the JWT claim: the
  -- claim is whatever was minted into a token, the table is the record.
  select lower(btrim(u.email)) into v_email
    from auth.users u
   where u.id = v_auth
     and u.email_confirmed_at is not null;

  if v_email is null then
    return jsonb_build_object('ok', false, 'reason', 'unconfirmed');
  end if;

  -- Already bound. Nothing to do, and in particular nothing to re-bind: an
  -- account is tied to one registration for good.
  select id into v_bound from person where auth_user_id = v_auth;
  if v_bound is not null then
    return jsonb_build_object('ok', true, 'claimed', false);
  end if;

  -- Bind, but only to a registration no account holds. `person.email` is
  -- unique, so a matching row that is already bound means the address is
  -- spoken for; it is not available to a second account whatever it proves.
  begin
    update person
       set auth_user_id     = v_auth,
           email_verified_at = coalesce(email_verified_at, now()),
           updated_at        = now()
     -- Matched on the lowercased text rather than by the citext operator.
     -- `citext` lives in `extensions`, which is not on this function's
     -- search_path, and an unqualified comparison there would silently fall
     -- back to a case-sensitive one. The unique index on `email` is citext's
     -- own, so at most one row can match either way.
     where lower(email::text) = v_email
       and auth_user_id is null
    returning id into v_person;
  exception
    when unique_violation then
      -- Two sign-ins racing for the same row. The other one won; this account
      -- has nothing, which is the truth to report.
      return jsonb_build_object('ok', false, 'reason', 'no_registration');
  end;

  if v_person is null then
    return jsonb_build_object('ok', false, 'reason', 'no_registration');
  end if;

  return jsonb_build_object('ok', true, 'claimed', true);
end;
$fn$;

comment on function claim_registration () is
  'Ties the signed-in account to the registration holding the same confirmed email. Never re-binds, never takes a registration another account holds.';

-- ── 3. Reading it back ───────────────────────────────────────────────────────

create or replace function my_registration ()
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = public, pg_temp
  as $fn$
declare
  v_auth uuid := auth.uid();
  v_row  person;
  v_out  jsonb;
begin
  if v_auth is null then
    return null;
  end if;

  select * into v_row from person where auth_user_id = v_auth;
  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'fullName',          v_row.full_name,
    'city',              v_row.city,
    'role',              v_row.role,
    'phone',             coalesce(v_row.phone, ''),
    'email',             coalesce(v_row.email::text, ''),
    'pincode',           coalesce(v_row.pincode, ''),
    'dateOfBirth',       coalesce(to_char(v_row.date_of_birth, 'YYYY-MM-DD'), ''),
    'gender',            coalesce(v_row.gender::text, ''),
    'genderOther',       coalesce(v_row.gender_self_described, ''),
    'preferredLanguage', coalesce(v_row.preferred_language, ''),
    'consentWhatsapp',   coalesce(v_row.consent_whatsapp, false),
    'consentSms',        coalesce(v_row.consent_sms, false),
    'consentEmail',      coalesce(v_row.consent_email, false),
    -- Read-only, but shown: they are part of what we hold, and someone
    -- checking their record should see all of it.
    'heardFrom',         coalesce(v_row.heard_from::text, ''),
    'heardFromOther',    coalesce(v_row.heard_from_other, ''),
    'guardianName',      coalesce(v_row.guardian_name, ''),
    'guardianEmail',     coalesce(v_row.guardian_email::text, ''),
    'guardianPhone',     coalesce(v_row.guardian_phone, ''),
    'registeredAt',      to_char(v_row.created_at at time zone 'Asia/Kolkata', 'DD Mon YYYY'),
    'interests',         coalesce(
                           (select jsonb_agg(pi.pillar::text order by pi.pillar)
                              from person_interest pi
                             where pi.person_id = v_row.id),
                           '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$fn$;

comment on function my_registration () is
  'The caller''s own registration as JSON, or null if this account is bound to none.';

-- ── 4. Writing it back ───────────────────────────────────────────────────────

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
  'Writes back the fields a person may correct about themselves. Email, guardian, acquisition and the binding itself are not among them.';

-- ── 5. Who may call them ─────────────────────────────────────────────────────

revoke all on function claim_registration () from public;
revoke all on function my_registration () from public;
revoke all on function update_my_registration (jsonb) from public;

-- Signed in only. `anon` has no business with any of the three.
grant execute on function claim_registration () to authenticated;
grant execute on function my_registration () to authenticated;
grant execute on function update_my_registration (jsonb) to authenticated;

commit;
