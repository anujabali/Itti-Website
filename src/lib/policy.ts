/**
 * The privacy policy currently in force.
 *
 * Two things read this: the policy page, which prints the version and date at
 * the head of it, and the registration client, which stamps the version onto
 * every consent record it writes. They must not drift. Section 12 of the policy
 * promises that the version stored against a consent identifies the terms the
 * person actually agreed to, and that promise is only kept while there is one
 * place the number is written.
 *
 * When the policy changes materially, raise both of these together. Consent
 * records already written keep the version they were given — they are the
 * evidence of an earlier agreement, not a copy of the current one.
 */

/** Stored form, matching the `v1.0` records already in `consent_record`. */
export const POLICY_VERSION = 'v2.0';

/** Printed form. The stamp reads "Version 2.0", not "Version v2.0". */
export const POLICY_LABEL = POLICY_VERSION.replace(/^v/, '');

export const POLICY_UPDATED = '9 September 2026';
