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
| GST Number (optional) | Label suffix: **For GST Tax Invoice**. Placeholder example `22AAAAA0000A1Z5`. |
| Business Name | Maps to `billingBusinessName`. |
| Billing address | Line 1, optional line 2, city. |
| State | Numeric GST State code + name. Never postal abbreviations (MH/UP) as the stored code. |
| PIN | `billingPostalCode`. |

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
