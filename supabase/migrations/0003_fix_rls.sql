-- Fix Row Level Security (RLS) to allow public website visitors to register

-- 1. person table
drop policy if exists person_self_insert on person;
create policy person_self_insert on person
  for insert with check (true);

drop policy if exists person_self_read on person;
create policy person_self_read on person
  for select using (true);

-- 2. subject table
drop policy if exists subject_self on subject;
create policy subject_self_insert on subject
  for insert with check (true);

create policy subject_self_select on subject
  for select using (true);

-- 3. health_intake table
drop policy if exists health_intake_self_insert on health_intake;
create policy health_intake_self_insert on health_intake
  for insert with check (true);

-- 4. consent_record table
drop policy if exists consent_self_insert on consent_record;
create policy consent_self_insert on consent_record
  for insert with check (true);
