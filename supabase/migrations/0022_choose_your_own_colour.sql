-- Somebody can choose the colour their account wears
--
-- Four choices, and all four are already the site's: the brand teal and the
-- three the pillars carry. Nothing new is invented, because a palette that
-- grows one shade at a time stops being a palette.
--
-- Null means unchosen, and unchosen means teal. It is stored rather than
-- derived from their areas so that a person who changes what they are here for
-- does not silently change how their page looks.

begin;

create type accent_kind as enum ('teal', 'ochre', 'rose', 'sage');

alter table person
  add column if not exists accent accent_kind;

comment on column person.accent is
  'The colour this person''s account page wears. Null is unchosen, which renders as the brand teal.';

-- ── read it back ─────────────────────────────────────────────────────────────

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
begin
  if v_auth is null then
    return null;
  end if;

  select * into v_row from person where auth_user_id = v_auth;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
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
    'bio',               coalesce(v_row.bio, ''),
    'accent',            coalesce(v_row.accent::text, ''),
    'consentWhatsapp',   coalesce(v_row.consent_whatsapp, false),
    'consentSms',        coalesce(v_row.consent_sms, false),
    'consentEmail',      coalesce(v_row.consent_email, false),
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
                           '[]'::jsonb),
    'links',             coalesce(
                           (select jsonb_object_agg(pl.kind::text, pl.value)
                              from person_link pl
                             where pl.person_id = v_row.id),
                           '{}'::jsonb),
    'linksVerified',     coalesce(
                           (select jsonb_object_agg(pl.kind::text, true)
                              from person_link pl
                             where pl.person_id = v_row.id
                               and pl.verified_at is not null),
                           '{}'::jsonb)
  );
end;
$fn$;

commit;
