-- A second leak, of the same kind as the first, in a place nobody had looked.
--
-- `health_intake_current` and `analysis_intake` are views over the clinical
-- tables. A view runs with the permissions of whoever defined it unless it is
-- told otherwise, so both bypassed row-level security entirely — and PostgREST
-- exposes every view in `public` as an endpoint. `health_intake_current` was
-- readable by anyone holding the publishable key: pillar, ailment, treatment
-- status, modalities, diagnosis year, per subject.
--
-- 0004 closed the tables and left the views open, because closing tables is the
-- thing you think of and views are the thing you forget. Supabase's own linter
-- flags both as ERROR.

begin;

-- ── 1. The views obey the caller's permissions, not their author's ──────────

alter view health_intake_current set (security_invoker = on);
alter view analysis_intake set (security_invoker = on);

-- And they leave the API surface altogether. Neither is for the browser:
-- `analysis_intake` is for analysts, `health_intake_current` is a helper for
-- queries that run inside the database.
revoke all on health_intake_current from anon, authenticated;
revoke all on analysis_intake from anon, authenticated;

-- ── 2. The rate limiter is not a public endpoint ────────────────────────────
-- Revoking from PUBLIC in 0005 was not enough: Supabase grants EXECUTE to anon
-- and authenticated directly, and a direct grant outlives a revoke from PUBLIC.
-- It is called by register_member, which runs as its owner and does not need
-- the grant.

revoke all on function registration_within_rate_limit () from anon, authenticated;

-- ── 3. Functions get a fixed search_path ────────────────────────────────────
-- Without one, a function resolves unqualified names through whatever
-- search_path the caller happens to have. For the trigger functions in
-- particular that is how a table you did not mean to write to gets written to.

alter function person_age (p person) set search_path = public, pg_temp;
alter function person_is_minor (p person) set search_path = public, pg_temp;
alter function has_consent (p_person uuid, p_purpose text) set search_path = public, pg_temp;
alter function touch_updated_at () set search_path = public, pg_temp;
alter function assign_intake_version () set search_path = public, pg_temp;
alter function age_band (dob date) set search_path = public, pg_temp;

-- ── 4. RLS policies stop re-deciding who you are for every row ──────────────
-- `auth.uid()` in a policy body is re-evaluated per row. Wrapped in a scalar
-- subquery it is evaluated once and the result reused, which is the difference
-- between a sequential scan and an index lookup once these tables have any size
-- to them. The rules themselves are unchanged.

drop policy if exists person_self_read on person;
create policy person_self_read on person
  for select using (
    auth_user_id is not null and (select auth.uid()) = auth_user_id
  );

drop policy if exists person_self_insert on person;
create policy person_self_insert on person
  for insert with check (
    auth_user_id is not null and (select auth.uid()) = auth_user_id
  );

drop policy if exists person_self_write on person;
create policy person_self_write on person
  for update using (
    auth_user_id is not null and (select auth.uid()) = auth_user_id
  )
  with check (
    auth_user_id is not null and (select auth.uid()) = auth_user_id
  );

drop policy if exists subject_self on subject;
create policy subject_self on subject
  for all using (
    person_id in (
      select id from person
      where auth_user_id is not null and auth_user_id = (select auth.uid())
    )
  );

drop policy if exists health_intake_self_read on health_intake;
create policy health_intake_self_read on health_intake
  for select using (
    subject_id in (
      select s.id from subject s
      join person p on p.id = s.person_id
      where p.auth_user_id is not null and p.auth_user_id = (select auth.uid())
    )
  );

drop policy if exists health_intake_self_insert on health_intake;
create policy health_intake_self_insert on health_intake
  for insert with check (
    subject_id in (
      select s.id from subject s
      join person p on p.id = s.person_id
      where p.auth_user_id is not null and p.auth_user_id = (select auth.uid())
    )
  );

drop policy if exists consent_self_read on consent_record;
create policy consent_self_read on consent_record
  for select using (
    person_id in (
      select id from person
      where auth_user_id is not null and auth_user_id = (select auth.uid())
    )
  );

drop policy if exists consent_self_insert on consent_record;
create policy consent_self_insert on consent_record
  for insert with check (
    person_id in (
      select id from person
      where auth_user_id is not null and auth_user_id = (select auth.uid())
    )
  );

commit;
