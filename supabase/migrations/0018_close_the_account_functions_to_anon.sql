-- The account functions were left open to `anon`
--
-- 0017 revoked them from PUBLIC and granted EXECUTE to `authenticated`, which
-- reads as closed and is not. Supabase hands `anon` and `authenticated` EXECUTE
-- on functions in `public` through ALTER DEFAULT PRIVILEGES, and a grant made
-- directly to a role is not touched by a revoke from PUBLIC. 0007 recorded this
-- exact trap for `registration_within_rate_limit` and 0017 did not apply it.
--
-- Nothing was exposed by it. All three read `auth.uid()` before they do
-- anything and return their signed-out answer when it is null, so a caller
-- without a session got a refusal rather than a record. But a function that is
-- callable by the public role and safe only because of a check inside it is one
-- edit away from being neither, and the grant is the part that should not
-- depend on the body staying careful.
--
-- Verified against the live project before and after: `claim_registration`
-- answered anon with its own JSON, and now refuses with 42501.

begin;

revoke all on function claim_registration () from anon;
revoke all on function my_registration () from anon;
revoke all on function update_my_registration (jsonb) from anon;

-- Named again rather than assumed. A revoke from PUBLIC above did not remove
-- these, so nothing here should be trusted to have survived either.
grant execute on function claim_registration () to authenticated;
grant execute on function my_registration () to authenticated;
grant execute on function update_my_registration (jsonb) to authenticated;

commit;
