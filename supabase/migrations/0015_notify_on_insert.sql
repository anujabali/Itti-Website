-- The outbox calls the sender itself.
--
-- This is what Supabase's "Database Webhooks" are underneath: a trigger that
-- makes an HTTP request through pg_net. Doing it here rather than in the
-- dashboard means it is in the migrations with everything else — it moves with
-- the project, it is reviewable, and a new environment gets it by replaying
-- rather than by someone remembering to click.
--
-- Statement-level, not row-level: the sender drains every pending row it finds,
-- so one call per insert is enough however many rows that insert wrote.
--
-- The secret is read from `app_secret`, which has RLS on and no policies, so it
-- is never in this file and never in the repository.

begin;

create extension if not exists pg_net with schema extensions;

create or replace function notify_outbox ()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, extensions, pg_temp
  as $fn$
declare
  v_secret text;
  v_url    text;
begin
  select value into v_secret from app_secret where key = 'notify_hook_secret';
  select value into v_url from app_secret where key = 'notify_function_url';

  -- Unconfigured is not a reason to fail a registration. The row stays pending
  -- and a later run picks it up.
  if v_secret is null or v_url is null then
    return null;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', v_secret
    ),
    body := '{}'::jsonb
  );

  return null;
end;
$fn$;

revoke all on function notify_outbox () from public, anon, authenticated;

drop trigger if exists notification_send on notification;
create trigger notification_send
  after insert on notification
  for each statement
  execute function notify_outbox();

commit;
