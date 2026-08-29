-- The Itti Foundation — identity & contact
--
-- This migration holds everything that identifies a person. Clinical data lives
-- in 0002 and never shares a table with anything here: the two are joined by
-- `person.id`, and analysts are given access to the clinical side only.
--
-- Supabase's own `auth.users` remains the authentication record (phone, OTP,
-- email). `person` is the profile hanging off it.

-- ── Controlled vocabularies ──────────────────────────────────────────────────
-- Enums rather than free text, everywhere an answer will later be counted.
-- Every user-facing list also carries an "other" member with a matching
-- `*_other` free-text column; those are reviewed monthly and real answers are
-- promoted into the enum. Free text that is never promoted is never analysed.

create type role_kind as enum (
  'patient',      -- the person with the ailment
  'caregiver',    -- parent, spouse, adult child. Step 3 describes the cared-for
  'both',         -- a patient who also cares for someone else
  'supporter'     -- neither: a donor, volunteer, or interested member
);

create type gender_kind as enum (
  'woman',
  'man',
  'non_binary',
  'self_described',
  'undisclosed'   -- distinct from NULL: NULL is "not asked yet"
);

create type contact_channel as enum ('whatsapp', 'sms', 'email', 'push');

create type heard_from as enum (
  'friend_family',   -- pairs with referrer_name / referrer_code
  'doctor_hospital',
  'event',
  'podcast',
  'instagram',
  'youtube',
  'whatsapp_group',
  'search',
  'news',
  'volunteer_staff',
  'other'
);

-- ── person ───────────────────────────────────────────────────────────────────

create table person (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,

  -- Step 1 — account
  full_name text not null check (length(btrim(full_name)) between 1 and 120),
  phone text unique check (phone ~ '^\+[1-9][0-9]{7,14}$'),   -- E.164
  email citext unique,
  phone_verified_at timestamptz,
  email_verified_at timestamptz,

  -- Step 2 — about you.
  -- All nullable: step 2 is completable later, and a half-finished profile is
  -- still an account.
  date_of_birth date check (
    date_of_birth > current_date - interval '120 years'
    and date_of_birth <= current_date
  ),
  gender gender_kind,
  gender_self_described text check (
    gender_self_described is null or gender = 'self_described'
  ),
  pincode text check (pincode ~ '^[1-9][0-9]{5}$'),           -- India, 6 digits
  preferred_language text,                                    -- BCP-47: 'ta', 'hi', 'en-IN'
  role role_kind,

  -- Notification consent. Separate columns because these are separate
  -- consents in law, not one preference. NULL = never asked.
  contact_preferred contact_channel,
  consent_whatsapp boolean,
  consent_sms boolean,
  consent_email boolean,

  -- Acquisition. Self-report and UTM both, because each catches what the
  -- other misses: UTM is accurate but blind to offline word of mouth.
  heard_from heard_from,
  heard_from_other text check (heard_from_other is null or heard_from = 'other'),
  referrer_name text,
  referrer_code text,
  utm jsonb not null default '{}'::jsonb,

  -- Staff-assisted signup: recorded at signup, never inferred afterwards.
  assisted_by uuid references auth.users (id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One of the two contactable channels must exist, or the account is a
  -- dead letter.
  constraint person_reachable check (phone is not null or email is not null)
);

comment on column person.date_of_birth is
  'DOB, never a stored age. Age is a decaying value that is wrong within a year and destroys longitudinal analysis. Compute age at query time via person_age().';
comment on column person.pincode is
  'Six-digit Indian PIN. Resolves to district and state, and answers shipping serviceability in phase 2. Never a free-text area name.';
comment on column person.assisted_by is
  'Set when a volunteer or staff member completed this form on the person''s behalf. Their consent is recorded separately in consent_record with channel = in_person.';

create index person_pincode_idx on person (pincode);
create index person_role_idx on person (role);
create index person_created_at_idx on person (created_at);

-- Age is derived, never stored.
create function person_age (p person) returns integer
  language sql stable
  as $$ select extract(year from age(p.date_of_birth))::integer $$;

-- Under-18 is a compliance question (DPDP sets the threshold at 18 and requires
-- verifiable parental consent), so it gets a first-class helper rather than
-- being recomputed in application code each time.
create function person_is_minor (p person) returns boolean
  language sql stable
  as $$ select p.date_of_birth > current_date - interval '18 years' $$;

-- ── consent ──────────────────────────────────────────────────────────────────
-- Append-only. A withdrawal is a new row with granted = false, never an update,
-- so the history of what someone agreed to and when is always reconstructable.

create table consent_record (
  id bigserial primary key,
  person_id uuid not null references person (id) on delete cascade,
  purpose text not null,            -- 'account', 'health_intake', 'whatsapp', 'sms', 'email', 'dietary'
  granted boolean not null,
  policy_version text not null,     -- the privacy policy version shown at the time
  channel text not null default 'web',  -- 'web' | 'in_person' | 'phone'
  granted_by uuid references auth.users (id),  -- set for parental or staff-assisted consent
  created_at timestamptz not null default now()
);

comment on table consent_record is
  'Append-only. Withdrawal is a new row with granted = false. The policy_version stamp is what stands up in an audit.';

create index consent_person_idx on consent_record (person_id, purpose, created_at desc);

-- Current state of one consent, derived from the log.
create function has_consent (p_person uuid, p_purpose text) returns boolean
  language sql stable
  as $$
    select coalesce(
      (select granted from consent_record
        where person_id = p_person and purpose = p_purpose
        order by created_at desc limit 1),
      false
    )
  $$;

-- ── updated_at ───────────────────────────────────────────────────────────────

create function touch_updated_at () returns trigger
  language plpgsql
  as $$ begin new.updated_at = now(); return new; end $$;

create trigger person_touch before update on person
  for each row execute function touch_updated_at();

-- ── Row-level security ───────────────────────────────────────────────────────
-- Default deny. A person sees their own row and nothing else; there is no
-- policy granting anyone read access across people, so analytics cannot reach
-- this table at all — it queries the clinical side (0002) instead.

alter table person enable row level security;
alter table consent_record enable row level security;

create policy person_self_read on person
  for select using (auth.uid() = auth_user_id);

create policy person_self_write on person
  for update using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

create policy person_self_insert on person
  for insert with check (auth.uid() = auth_user_id);

create policy consent_self_read on consent_record
  for select using (
    person_id in (select id from person where auth_user_id = auth.uid())
  );

-- Insert only. No update or delete policy exists, which is what makes the
-- consent log append-only for everyone holding an anon or authenticated key.
create policy consent_self_insert on consent_record
  for insert with check (
    person_id in (select id from person where auth_user_id = auth.uid())
  );
