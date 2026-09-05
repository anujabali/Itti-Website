-- citext lives in `extensions`, not `public`.
--
-- An extension in `public` puts its functions and operators in the same
-- namespace as the application's own, where a later object can shadow one of
-- them, and `public` is the schema PostgREST exposes. Supabase's linter flags
-- it, and its own convention is a dedicated `extensions` schema.
--
-- `person.email` is a citext column, so the type moves with the extension.
-- Verified on the live database before applying: the column still reports its
-- type as `citext` afterwards.

begin;

create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;

alter extension citext set schema extensions;

commit;
