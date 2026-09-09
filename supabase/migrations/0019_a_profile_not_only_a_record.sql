-- A person is more than the form they filled in
--
-- Everything held about somebody so far was collected by us, for us: a name, a
-- city, a role from a list of four. There was nowhere for them to say anything
-- in their own words, and nowhere to point at the rest of their life.
--
-- Two additions, and they are deliberately different in kind. `bio` is prose
-- the person writes. `person_link` is where they can be found elsewhere.
-- Neither is required, neither is used for anything operational, and nothing
-- already stored changes meaning.
--
-- What this is NOT: verification. A handle here is a claim the person makes
-- about themselves, exactly like the name they typed. Proving that an account
-- belongs to them means OAuth with each provider, app review, and a business
-- verification with Meta — a different job entirely. `verified_at` is present
-- so that job has somewhere to land, and is never set by this migration.

begin;

alter table person
  add column if not exists bio text
    check (bio is null or length(bio) <= 600);

comment on column person.bio is
  'The person''s own words about themselves. Shown on their account page, never used to decide anything.';

create type link_kind as enum (
  'instagram',
  'facebook',
  'youtube',
  'linkedin',
  'website',
  'email'      -- an additional address to reach them at, never a sign-in credential
);

create table if not exists person_link (
  person_id uuid not null references person (id) on delete cascade,
  kind link_kind not null,
  -- A handle for the social kinds, a URL for `website`, an address for `email`.
  -- Stored as the person gave it, minus the decoration: no leading @, no
  -- scheme, so the site can render it consistently wherever it appears.
  value text not null check (length(btrim(value)) between 1 and 200),
  -- Set only when a provider has confirmed the account is theirs. Nothing sets
  -- it yet; it exists so that adding OAuth later is not a schema change.
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  -- One of each kind. Somebody with two Instagram accounts can pick.
  primary key (person_id, kind)
);

comment on table person_link is
  'Where a person can be found elsewhere. Self-asserted: a handle here is a claim, not a proof, until verified_at is set by a provider.';

create index if not exists person_link_kind_idx on person_link (kind);

alter table person_link enable row level security;
revoke all on person_link from anon, authenticated;

-- Same rule as every other table here: your own rows, and only when signed in.
-- The grants are revoked above regardless, so reaching this needs a function
-- that runs as its owner — which is how everything else on this page works.
create policy person_link_self on person_link
  for all using (
    person_id in (
      select id from person
      where auth_user_id is not null and auth_user_id = (select auth.uid())
    )
  );

commit;
