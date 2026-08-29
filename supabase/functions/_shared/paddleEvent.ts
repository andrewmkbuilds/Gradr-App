/**
 * Pure parsing layer for Paddle webhook payloads.
 *
 * The webhook handler must keep working when Paddle changes casing or moves a
 * field between `custom_data` and `import_meta`, so every read of an incoming
 * event goes through these helpers. They have no I/O and no Deno dependency,
 * which lets `src/test/paymentsWebhookContract.test.ts` assert them against
 * real event fixtures from both the SDK (camelCase) and the raw REST JSON
 * (snake_case).
 */

export interface PaddleMoneyTotals {
  total?: string | number | null;
  subtotal?: string | number | null;
  discount?: string | number | null;
  grandTotal?: string | number | null;
  grand_total?: string | number | null;
}

export interface PaddlePriceRef {
  id?: string | null;
  productId?: string | null;
  product_id?: string | null;
  unitPrice?: { amount?: string | number | null } | null;
  unit_price?: { amount?: string | number | null } | null;
  customData?: Record<string, unknown> | null;
  custom_data?: Record<string, unknown> | null;
  importMeta?: { externalId?: string | null } | null;
  import_meta?: { external_id?: string | null } | null;
}

export interface PaddleProductRef {
  customData?: Record<string, unknown> | null;
  custom_data?: Record<string, unknown> | null;
  importMeta?: { externalId?: string | null } | null;
  import_meta?: { external_id?: string | null } | null;
}

export interface PaddleLineItem {
  price?: PaddlePriceRef | null;
  product?: PaddleProductRef | null;
  quantity?: number | null;
}

/** Union-ish shape covering the fields used across the various Paddle event types. */
export interface PaddleEventData {
  id?: string | null;
  email?: string | null;
  customerId?: string | null;
  customer_id?: string | null;
  customData?: { userId?: string | null; user_id?: string | null } | null;
  custom_data?: { userId?: string | null; user_id?: string | null } | null;
  status?: string | null;
  items?: PaddleLineItem[] | null;
  scheduledChange?: { action?: string | null; effectiveAt?: string | null } | null;
  scheduled_change?: { action?: string | null; effective_at?: string | null } | null;
  currentBillingPeriod?: { endsAt?: string | null } | null;
  current_billing_period?: { ends_at?: string | null } | null;
  billingPeriod?: { endsAt?: string | null } | null;
  billing_period?: { ends_at?: string | null } | null;
  subscriptionId?: string | null;
  subscription_id?: string | null;
  transactionId?: string | null;
  transaction_id?: string | null;
  details?: { totals?: PaddleMoneyTotals | null } | null;
  totals?: PaddleMoneyTotals | null;
  payoutTotals?: PaddleMoneyTotals | null;
  currencyCode?: string | null;
  currency_code?: string | null;
  discountId?: string | null;
  discount_id?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  canceledAt?: string | null;
  billedAt?: string | null;
  invoiceNumber?: string | null;
  action?: string | null;
}

export interface PaddleWebhookEvent {
  eventType: string;
  eventId?: string | null;
  data: PaddleEventData;
}

/**
 * Entitlement rule. `past_due` keeps access during Paddle's dunning retries;
 * `canceled`/`paused` keep it until the paid period actually ends.
 */
export function isEntitled(status: string, periodEnd: string | null): boolean {
  if (["active", "trialing", "past_due"].includes(status)) return true;
  if (["canceled", "paused"].includes(status)) {
    return Boolean(periodEnd) && new Date(periodEnd as string) > new Date();
  }
  return false;
}

/**
 * Human-readable price id for a line item. Catalog prices created in-app carry
 * it in `custom_data.external_id`; prices imported into Paddle carry it in
 * `import_meta.external_id`. Support both, in either casing.
 */
export function priceExternalId(item: PaddleLineItem | null | undefined): string | undefined {
  return (item?.price?.customData?.external_id ??
    item?.price?.custom_data?.external_id ??
    item?.price?.importMeta?.externalId ??
    item?.price?.import_meta?.external_id) as string | undefined;
}

/** Human-readable product id, used when a price carries no external id. */
export function productExternalId(item: PaddleLineItem | null | undefined): string | undefined {
  return (item?.product?.customData?.external_id ??
    item?.product?.custom_data?.external_id ??
    item?.product?.importMeta?.externalId ??
    item?.product?.import_meta?.external_id) as string | undefined;
}

/** The app user this event belongs to, as passed through checkout `customData`. */
export function userIdOf(data: PaddleEventData): string | null {
  return (
    data?.customData?.userId ??
    data?.customData?.user_id ??
    data?.custom_data?.userId ??
    data?.custom_data?.user_id ??
    null
  );
}

/** End of the current paid period, whichever field Paddle used for this event. */
export function periodEndOf(data: PaddleEventData): string | null {
  return (
    data?.currentBillingPeriod?.endsAt ??
    data?.current_billing_period?.ends_at ??
    data?.billingPeriod?.endsAt ??
    data?.billing_period?.ends_at ??
    null
  );
}

/** True when the subscription is scheduled to cancel at period end. */
export function cancelsAtPeriodEnd(data: PaddleEventData): boolean {
  return (data?.scheduledChange?.action ?? data?.scheduled_change?.action) === "cancel";
}

/** Paddle amounts are minor-unit strings; return them as a number of cents. */
export function amountCents(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Order total for a transaction event, in minor units. */
export function totalCents(data: PaddleEventData): number | null {
  const totals = data?.details?.totals ?? data?.totals ?? null;
  return amountCents(totals?.total ?? totals?.grandTotal ?? totals?.grand_total ?? null);
}

/** Currency for a transaction event. */
export function currencyOf(data: PaddleEventData): string | null {
  return data?.currencyCode ?? data?.currency_code ?? null;
}
