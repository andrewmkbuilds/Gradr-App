# Trial & billing preview test runbook

How to exercise the 7-day trial, refunds and allowance resets in the preview
(test environment) without touching live money.

## What is configured

- Every **monthly** price in the test catalog carries a 7-day trial
  (`starter_monthly`, `pro_monthly`, `advanced_monthly`). Yearly plans bill
  immediately — this is deliberate.
- The trial length quoted in the UI and emails comes from `TRIAL_DAYS` in
  `src/config/pricing.ts`. Change it there **and** on the Paddle prices, or the
  copy and the charge disagree.
- Trial state lands in `subscribers.trial_start` / `subscribers.trial_end`, set
  by the webhook from the `trial_dates` on the subscription event.
- Allowances now reset on the **billing anniversary**
  (`public.billing_period_start`), not the 1st of the month. Users with no plan
  keep calendar months.

## 1. Start a trial

1. Open the preview and sign in (a real account — checkout needs `userId` in
   `customData`).
2. Go to `/pricing`, switch the toggle to **Monthly**, pick a plan. The CTA
   should read "Start 7-day free trial".
3. Pay with test card `4242 4242 4242 4242`, CVC `123`, any future expiry, any
   name. The checkout total must show **$0.00 due today**.

Expected within a few seconds:

| Where | Expect |
| --- | --- |
| `subscribers` | `subscription_status = 'trialing'`, `subscribed = true`, `trial_end` ≈ now + 7 days, correct `subscription_tier` |
| `paddle_subscriptions` | mirrored row, status `trialing` |
| `webhook_deliveries` | `subscription.created` row in state `processed` |
| Email | "Your 7-day Gradr … trial has started" (no receipt) |
| Dashboard | trial banner with days left and the first-charge date |

Other useful test cards: `4000 0000 0000 0002` always declines,
`4000 0027 6000 3184` succeeds then fails on renewal (good for dunning),
`4000 0000 0000 3220` forces 3-D Secure.

## 2. Trial reminders

The reminder mail is ours, not Paddle's. `payments-watchdog` sends
`trial-ending` at **3 days** and **1 day** before `trial_end`, keyed so repeated
sweeps can't double-send, and skips anyone who already cancelled.

To test without waiting: set `trial_end` on the subscriber row to
`now() + interval '3 days'` and run the watchdog (admin billing ops console →
run sweep, or POST with `x-cron-secret`). Check the response's `trials.notified`
and the `email_delivery_audit` row.

## 3. Trial converting to paid

Paddle bills at `trial_end`. To avoid waiting a week, pull the billing date
forward with the Update Subscription API:

```jsonc
PATCH /subscriptions/{id}
{ "next_billed_at": "<at least 31 minutes from now>", "proration_billing_mode": "do_not_bill" }
```

Constraints: `proration_billing_mode` is required, the new date must be more
than 30 minutes out, and trial subscriptions must use `do_not_bill`.

On conversion you should see `subscription.updated` with `status: active`, the
subscriber row flip to `active`, and the "plan is active" mail — the webhook
only sends that on the `trialing → active` transition, so a trial never
produces two welcome mails.

## 4. Cancelling during the trial

Cancel from `/subscription`. Expect: no charge, access until `trial_end`, the
"trial was cancelled — no charge" email, and `cancel_at_period_end = true`
(the trial banner then stops promising a charge).

## 5. Refunds

Issue a refund in the Paddle test dashboard (test refunds auto-approve about
every 10 minutes) or `POST /adjustments`.

- Subscription refund: access is revoked **immediately** —
  `subscribers.subscribed = false`, status `refunded` / `charged_back`.
- Credit pack refund: unspent credits are clawed back, clamped at zero, and the
  shortfall is written to `entitlement_ledger.metadata.shortfall`.
- Replaying the same adjustment is a no-op: the reversal is guarded on the
  provider event id and returns `already_reversed`.

## 6. Webhooks and `traffic_source: platform`

Lovable registers the notification destinations, and they are
`traffic_source: platform`, which means **the Paddle Simulator cannot deliver to
them**. Simulated events go nowhere, so don't use the simulator to test the
trial lifecycle.

Use instead, in order of preference:

1. **Real sandbox actions** — checkout, cancel, refund. These are genuine
   events and do reach the handler.
2. **Fast-forward `next_billed_at`** (section 3) to force renewals, conversions
   and dunning without waiting.
3. **Replay a delivered notification** —
   `POST /notifications/{id}/replay`, or the replay button in the admin webhook
   log. Only works for real events, and only within 90 days.

Two destinations per environment is correct: one is the app's
`payments-webhook`, the other feeds Lovable's payments analytics. Deleting
either breaks something — leave both.

## 7. Allowance reset check

For a subscriber whose `current_period_end` is, say, the 22nd, usage should
reset on the 22nd, not the 1st. Verify with:

```sql
select public.billing_period_start('<user-uuid>', 'sandbox');
select * from public.feature_usage where user_id = '<user-uuid>';
```

The migration that introduced this moved existing current-month usage onto the
new period (merging where a row already existed), so nobody received a second
allowance or lost usage they had already spent.
