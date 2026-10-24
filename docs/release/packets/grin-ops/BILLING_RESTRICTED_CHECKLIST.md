# Restricted billing checklist (purchase-entry OFF)

**Not activation. Not store acceptance. Not a public-paid grant.**

Application pin described: `540e07a`. Client flags default **off**:
`EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED="0"`,
`EXPO_PUBLIC_QUOTA_UPSELL_ENABLED="0"`. Server `PLAY_BILLING_ENABLED` remains
fail-closed unless separately authorized.

Injected / unit / emulator host tests ≠ Play or App Store acceptance.

| Area | Source / test locus | Restricted status |
|---|---|---|
| Catalog SKUs (9: starter/pro/business × monthly/quarterly/yearly) | `src/billing/iap/iapCatalog.ts`, `functions/src/billing/products.ts` | Mapped; display prices from store only |
| Receipt verification Android | `validateAndActivateAndroid`, Play verifier unit/emulator tests | Source present; live flag off |
| Receipt verification iOS | `validateAndActivateIOS`, Apple verifier tests | Source present; live flag off |
| RTDN / ASSN | `androidRtdn`, `appStoreServerNotificationsV2` | Source present; Pub/Sub / ASSN live wiring gated |
| Purchase / pending / cancel-with-remaining | transition + lifecycle tests | Source covered; device NOT RUN |
| Restore | IAP session / manage presentation | Source; device NOT RUN |
| Duplicate delivery idempotency | `_processedBillingEvents` / ledger tests | Source covered |
| Refund / revocation | reconciliation queue + Play refund paths | Source; live NOT RUN |
| Expiry / grace / onHold | `deriveEntitlement` / client features | Source covered |
| Account switching / ownership indexes | `_playAccountIndex`, `_appStoreAccount*` | Source; collision fail-closed |
| Quota upsell UI | `QuotaUpsellHost` | Gate default off — do not treat as server authz |
| GST / invoices | tax orchestrator + invoice renderer | Separate deploy; owner/CA policy HOLD |

**Do not** claim client visibility of Settings → Subscription as server
authorization or store acceptance.
