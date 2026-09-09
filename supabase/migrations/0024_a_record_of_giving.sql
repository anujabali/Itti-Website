-- A record of giving.
--
-- One row per attempt, created before the donor is sent to the gateway and
-- completed when the gateway says what happened. Written that way round on
-- purpose: a donation that fails halfway leaves evidence, and a payment that
-- arrives for an order we never made is a payment we should refuse to record.
--
-- Nothing here holds a card number, a UPI handle or any other instrument. The
-- gateway holds those; we hold its identifiers for them, which is what a
-- refund, a reconciliation or a dispute actually needs.

create type donation_status as enum (
  'created',    -- the order exists at the gateway; nobody has paid yet
  'paid',       -- the gateway confirmed it, and the signature verified
  'failed',     -- the gateway reported a failure
  'refunded'
);

create table donation (
  id            uuid primary key default gen_random_uuid(),

  -- Amounts are held in paise, as integers, because that is the unit the
  -- gateway speaks and because money in a float is a bug waiting for a
  -- reconciliation.
  amount_paise  bigint not null check (amount_paise >= 100),
  currency      text   not null default 'INR' check (currency = 'INR'),

  status        donation_status not null default 'created',

  -- Where the donor asked it to go. Null is "wherever it is needed most", which
  -- is a real answer rather than a missing one.
  pillar        pillar_kind,

  -- The gateway's own identifiers.
  order_id      text not null unique,
  payment_id    text unique,

  -- What the donor told the gateway. Kept because a receipt needs a name and an
  -- address to send it to, and for no other purpose.
  donor_name    text,
  -- Plain text, not citext: the extension lives in `extensions` rather than
  -- `public` (see 0008), so an unqualified reference here would not resolve.
  -- Compared with lower() where it needs comparing at all.
  donor_email   text,
  donor_phone   text,

  -- Set only when a signed-in person gives, so their own giving can be shown
  -- back to them. A gift from a stranger is not less of a gift.
  person_id     uuid references person (id) on delete set null,

  -- The gateway's failure text, verbatim, for the day somebody asks why.
  last_error    text,

  created_at    timestamptz not null default now(),
  paid_at       timestamptz
);

create index donation_status_idx  on donation (status, created_at desc);
create index donation_person_idx  on donation (person_id) where person_id is not null;

alter table donation enable row level security;

-- No policy is written, so row-level security denies everything to anon and
-- authenticated alike. Only the service role — which bypasses RLS, and which
-- only the Edge Function holds — reads or writes this table. A donor's name,
-- address and amount are not the browser's business, including the donor's own
-- browser: the acknowledgement goes by email, from the server.
revoke all on donation from anon, authenticated;

comment on table donation is
  'One row per donation attempt. Written before the gateway is called and completed by it. Service role only.';
