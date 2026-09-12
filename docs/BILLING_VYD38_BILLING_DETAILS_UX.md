# VYD-38 hard dependency — Billing Details UX (from VYD-40)

VYD-40 implements the **server** billing-details schema, `updateBillingDetails`
callable/core, manual GSTIN verification, and fail-closed tax documents.
It does **not** add a Settings screen or `SubscriptionManagementScreen`.

The user-facing Billing Details section is deferred to VYD-38
(`SubscriptionManagementScreen`). That screen **must** include this section
before GST tax documents can be collected from customers in-app.

## Placement

Inside Subscription & Billing management — not a temporary Settings page.

## Fields

| Field | Notes |
| --- | --- |
| Recipient / Billing Name | Maps to `billingRecipientName`. Required for B2C tax invoices (including Google Play / Apple developer-issued supplies). Do not reuse optional business-name as the only individual name. |
| GST Number (optional) | Label suffix: **For GST Tax Invoice**. Placeholder example `22AAAAA0000A1Z5`. |
| Business Name | Maps to `billingBusinessName`. Optional; used where the recipient is a business. Not a substitute for Recipient / Billing Name. |
| Address line(s) | Line 1 required before a tax invoice may issue; optional line 2. |
| City | `billingCity`. |
| PIN | `billingPostalCode`. Required 6-digit PIN before a tax invoice may issue. |
| State | Numeric GST State code + name. Never postal abbreviations (MH/UP) as the stored code. |

The client may prefill these from an existing profile, but the backend tax
snapshot uses server-owned `users/{uid}/subscription/billingDetails` as the
authoritative source.

Save **only** through the `updateBillingDetails` callable. Clients must not
write `users/{uid}/subscription/billingDetails`.

## Validation copy

Inline, when the GSTIN fails server-side format validation:

> Invalid GST number format

## Helper copy (required)

> Providing your GST number allows us to prepare a business tax document where applicable. GST Input Tax Credit remains subject to eligibility under applicable GST law.

Do **not** promise automatic ITC eligibility.

## Server behaviour the UI must respect

- GSTIN is optional.
- A format-valid GSTIN is stored normalized (trim + uppercase) as
  `pending_manual_verification`. It is **never** marked `verified` by the client.
- Changing GSTIN clears any previous verified snapshot.
- Clearing GSTIN sets `not_provided`.
