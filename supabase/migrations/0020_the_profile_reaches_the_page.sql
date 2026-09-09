-- `my_registration` and `update_my_registration` carry the profile
--
-- 0019 added somewhere to keep a bio and a set of links. This is what lets the
-- person read and write them, through the same two functions everything else
-- on the account page already goes through — so the grants stay closed and the
-- browser still cannot touch a table directly.
--
-- The link values are normalised here rather than in the page, because the page
-- is a courtesy and this is the boundary. Somebody who pastes a whole profile
-- URL, or types the @, means the same thing as somebody who types the handle,
-- and all three should end up stored identically.

begin;

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
    -- An object rather than a list, so the page can ask for one kind without
    -- searching, and so a kind that is absent is simply absent.
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

comment on function my_registration () is
  'The caller''s own registration and profile as JSON, or null if this account is bound to none.';

-- ── Normalising a link ───────────────────────────────────────────────────────

create or replace function normalise_link (p_kind link_kind, p_value text)
  returns text
  language plpgsql
  immutable
  as $fn$
declare
  v text := btrim(coalesce(p_value, ''));
begin
  if v = '' then
    return null;
  end if;

  if p_kind = 'email' then
    return lower(v);
  end if;

  if p_kind = 'website' then
    -- Keep a scheme, add one when it is missing: a bare domain is what people
    -- type and a link without a scheme is resolved against this site.
    if v !~* '^https?://' then
      v := 'https://' || v;
    end if;
    return v;
  end if;

  -- A social handle. Accept the handle, the @handle, or the whole profile URL,
  -- and store the handle either way.
  v := regexp_replace(v, '^https?://', '', 'i');
  v := regexp_replace(v, '^www\.', '', 'i');
  v := regexp_replace(v, '^(instagram\.com|facebook\.com|youtube\.com|linkedin\.com)/', '', 'i');
  v := regexp_replace(v, '^(in/|@)', '', 'i');
  v := split_part(v, '/', 1);
  v := split_part(v, '?', 1);
  return btrim(v);
end;
$fn$;

revoke all on function normalise_link (link_kind, text) from public, anon, authenticated;

commit;
