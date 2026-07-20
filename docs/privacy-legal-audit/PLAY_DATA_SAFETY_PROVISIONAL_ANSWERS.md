# PLAY DATA SAFETY — PROVISIONAL ANSWERS

**Status:** Worksheet for Play Console · **Not submitted** · Tip `f1019b6`  
Owner must re-check against live Play form wording and final engineering fixes.

---

## Does your app collect or share any of the required user data types?

**Provisional:** Yes (account, personal info, photos when used, location when enabled, app activity/local prefs, files).

---

## Data collected (provisional checklist)

| Type | Collect? | Encrypted in transit? | Encrypted at rest? | Required? | Purposes |
|------|----------|----------------------|--------------------|-----------|----------|
| Name | Yes | Yes (HTTPS typical) | [EXTERNAL VERIFICATION REQUIRED] | Yes (for full use) | App functionality, account |
| Email | Yes if provided | Yes | [EXTERNAL…] | Optional* | Account |
| User IDs | Yes | Yes | [EXTERNAL…] | Yes | Account |
| Phone | Yes | Yes | [EXTERNAL…] | Yes | Account |
| Photos | Yes if user attaches | Yes | [EXTERNAL…] | Optional | App functionality |
| Approximate/Precise location | Yes if enabled | Yes | [EXTERNAL…] | Optional | App functionality |
| Files & docs | Yes (user content / PDFs) | Yes when uploaded | [EXTERNAL…] | Optional | App functionality |
| App interactions / in-app search history | Local recent search | N/A local | Device | Optional | App functionality |
| Diagnostics | No first-party suite found | — | — | — | Re-verify Firebase Console |

\*Email may become required for specific recovery/reactivation flows.

**Share with third parties?**  
Provisional guidance: declare **service providers** per Play’s definitions carefully. Do **not** declare “sold”. User-initiated sharing via share sheet is separate — follow Play’s current guidance for “user-initiated”.

---

## Account deletion

| Question | Provisional answer |
|----------|-------------------|
| Account creation? | Yes |
| Users can request delete account & data? | Yes |
| In-app pathway? | Yes — Settings → Delete Account & Data |
| Web link resource? | https://vyaamikk.specialsoftwares.com/delete-account |
| Data deleted? | Cloud DB records after 15-day grace; limitations apply (see deletion disclosure) |
| Additional retention? | Yes — limited anti-abuse indexes; device residual; shared PDFs |

---

## Security practices

| Practice | Answer |
|----------|--------|
| Data encrypted in transit | Yes (intended) |
| Independent review | No (unless owner obtains one) |
| Users can request delete | Yes |

---

## Privacy policy URL

https://vyaamikk.specialsoftwares.com/privacy  

**Must be live and consistent before submission.**

---

## Blockers before filing

1. Resolve Storage/Auth deletion gap or disclose precisely.  
2. Align support email / website legal pages to `.com`.  
3. Complete website tracking audit if Data Safety mentions web.  
4. Counsel review.  
5. Confirm no analytics SDK enabled in Firebase Console unexpectedly.
