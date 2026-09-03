-- The Itti Foundation — health intake
--
-- Nothing in this file identifies a person. The join back to `person` lives in
-- exactly one place — `subject.person_id` — and the analytics view below never
-- crosses it. That separation is cheap now and effectively impossible to
-- retrofit once real data exists.

-- ── Vocabularies ─────────────────────────────────────────────────────────────

create type pillar_kind as enum (
  'neurodivergence',
  'cancer_care',
  'claw',
  'not_sure',
  'other'
);

create type treatment_status as enum (
  'not_started',
  'ongoing',
  'completed',
  'remission',
  'palliative',
  'declined',      -- chose not to pursue treatment
  'undisclosed'    -- asked, declined to answer. Not the same as NULL.
);

create type treatment_modality as enum (
  'chemotherapy',
  'radiation',
  'surgery',
  'immunotherapy',
  'hormone_therapy',
  'targeted_therapy',
  'medication',
  'behavioural_therapy',
  'occupational_speech_therapy',
  'none',
  'other'
);

-- The ailment taxonomy is a table, not an enum, because it is the one
-- vocabulary certain to change: it still needs clinical review, and altering an
-- enum in production is painful where inserting a row is not.
create table ailment (
  code text primary key,
  pillar pillar_kind not null,
  label_en text not null,
  sort_order integer not null default 100,
  active boolean not null default true
);

comment on table ailment is
  'Seed and review with someone clinical. Answers landing in health_intake.ailment_other are reviewed monthly and promoted into this table; free text that is never promoted is never analysed.';

-- ── subject ──────────────────────────────────────────────────────────────────
-- Who the health data is *about*. For a caregiver this is not the account
-- holder, which is exactly why role is captured at step 2 — without it, a
-- caregiver's answers would be recorded as their own.

create table subject (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person (id) on delete cascade,
  relationship text not null check (relationship in ('self', 'cared_for')),
  created_at timestamptz not null default now()
);

create unique index subject_one_self_per_person
  on subject (person_id) where relationship = 'self';

create index subject_person_idx on subject (person_id);

-- ── health_intake ────────────────────────────────────────────────────────────
-- Append-only and versioned. When treatment status moves from ongoing to
-- completed, both rows are kept: the trajectory is worth more than the
-- snapshot, and overwriting destroys it irreversibly.

create table health_intake (
  id bigserial primary key,
  subject_id uuid not null references subject (id) on delete cascade,
  version integer not null,

  pillar pillar_kind,
  ailment_code text references ailment (code),
  ailment_other text,

  status treatment_status,
  modalities treatment_modality[] not null default '{}',
  modality_other text,

  -- Year alone. A diagnosis month is more identifying and less useful than
  -- "time since diagnosis", which is the thing actually analysed.
  diagnosis_year smallint check (diagnosis_year between 1900 and extract(year from current_date)),
  under_medical_supervision boolean,

  -- Who recorded this version, and how.
  source text not null default 'self' check (source in ('self', 'staff_assisted', 'import')),
  recorded_by uuid references auth.users (id),
  created_at timestamptz not null default now(),

  unique (subject_id, version)
);

comment on table health_intake is
  'Append-only. Never UPDATE a row here — write a new version. There is deliberately no update or delete RLS policy.';

create index health_intake_subject_idx on health_intake (subject_id, version desc);
create index health_intake_pillar_idx on health_intake (pillar);
create index health_intake_status_idx on health_intake (status);

-- Version numbers are assigned server-side so two concurrent writes cannot
-- collide on the same number.
create function assign_intake_version () returns trigger
  language plpgsql
  as $$
  begin
    select coalesce(max(version), 0) + 1 into new.version
      from health_intake where subject_id = new.subject_id;
    return new;
  end
  $$;

create trigger health_intake_version before insert on health_intake
  for each row execute function assign_intake_version();

-- Latest version per subject. Most reads want this, not the full history.
create view health_intake_current as
  select distinct on (subject_id) *
    from health_intake
    order by subject_id, version desc;

-- ── Analysis surface ─────────────────────────────────────────────────────────
-- Coarse demographics only: an age band rather than a DOB, a region rather than
-- a pincode, and no name, phone or email at any point. This is the view
-- analysts are granted, and it is why the split in 0001 exists.

-- Needs seeding from a public PIN-to-district dataset. Until it is seeded the
-- view simply reports NULL for region, which is honest rather than wrong.
create table pincode_region (
  pincode text primary key check (pincode ~ '^[1-9][0-9]{5}$'),
  district text,
  state text
);

create function age_band (dob date) returns text
  language sql immutable
  as $$
    select case
      when dob is null then null
      when dob > current_date - interval '18 years' then 'under_18'
      when dob > current_date - interval '25 years' then '18_24'
      when dob > current_date - interval '35 years' then '25_34'
      when dob > current_date - interval '45 years' then '35_44'
      when dob > current_date - interval '55 years' then '45_54'
      when dob > current_date - interval '65 years' then '55_64'
      else '65_plus'
    end
  $$;

create view analysis_intake as
  select
    s.id                        as subject_id,
    s.relationship,
    p.role,
    age_band(p.date_of_birth)   as age_band,
    p.gender,
    r.state,
    r.district,
    p.preferred_language,
    p.heard_from,
    date_trunc('month', p.created_at) as joined_month,
    h.pillar,
    h.ailment_code,
    h.status,
    h.modalities,
    h.diagnosis_year,
    extract(year from current_date)::int - h.diagnosis_year as years_since_diagnosis,
    h.under_medical_supervision
  from subject s
  join person p on p.id = s.person_id
  left join pincode_region r on r.pincode = p.pincode
  left join health_intake_current h on h.subject_id = s.id
  where has_consent(p.id, 'health_intake');

comment on view analysis_intake is
  'The only surface analysis should read. No name, phone, email, exact DOB or exact pincode. Filtered to people who actually consented to health data processing — consent withdrawal removes them from analysis automatically.';

-- ── Row-level security ───────────────────────────────────────────────────────

alter table subject enable row level security;
alter table health_intake enable row level security;
alter table ailment enable row level security;
alter table pincode_region enable row level security;

-- Reference data is readable by anyone signed in; it is a vocabulary, not data
-- about people.
create policy ailment_read on ailment
  for select using (true);
create policy pincode_read on pincode_region
  for select using (true);

create policy subject_self on subject
  for all using (
    person_id in (select id from person where auth_user_id is null or auth_user_id = auth.uid())
  ) with check (
    person_id in (select id from person where auth_user_id is null or auth_user_id = auth.uid())
  );

create policy health_intake_self_read on health_intake
  for select using (
    subject_id in (
      select s.id from subject s
      join person p on p.id = s.person_id
      where p.auth_user_id is null or p.auth_user_id = auth.uid()
    )
  );

-- Insert only, deliberately. No update or delete policy is what enforces
-- append-only at the database rather than by convention.
create policy health_intake_self_insert on health_intake
  for insert with check (
    subject_id in (
      select s.id from subject s
      join person p on p.id = s.person_id
      where p.auth_user_id is null or p.auth_user_id = auth.uid()
    )
  );
