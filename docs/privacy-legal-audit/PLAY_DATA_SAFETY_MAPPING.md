# PLAY DATA SAFETY MAPPING (PROVISIONAL)

**Tip:** `f1019b6` · Maps **code behaviour** to Play Console categories.  
**Not submitted to Play Console. Not a compliance guarantee.**  
Play definitions of “collect” / “share” must be applied by the owner using [User Data / Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10144311).

---

## 1. Data types likely in scope (from code)

| Play-oriented category | Collected? | Shared with other companies? (provisional) | Ephemeral? | Purpose (product) | Required/Optional | Notes |
|------------------------|------------|--------------------------------------------|------------|-------------------|-------------------|-------|
| Personal info — Name | Yes | Service providers (Firebase) process; not sold | No | Account | Name required for dashboard | |
| Personal info — Email | Yes if provided | Firebase + email vendor | No | Recovery / card | Optional until flows require verify | |
| Personal info — User IDs | Yes (uid, UEID) | Firebase | No | Account | Required | |
| Personal info — Phone | Yes | Firebase Auth / SMS | No | Auth | Required | |
| Financial info — User payment info | Possibly if user types UPI/IFSC/bank in records | Stored as user content in Firebase when synced | No | User records | Optional fields | **Not** app payments/subscriptions |
| Photos and videos | Yes when user attaches | Firebase Storage | No | Records/PDFs | Optional | |
| Audio files | No mic permission | — | — | — | — | Do not declare |
| Device or other IDs | Possible via Firebase/Expo SDKs | Google/Expo infra | Unknown | SDK ops | Automatic | **EXTERNAL** exact IDs |
| Approx / precise location | Yes if user enables footprints | Stored on records → Firestore if sync | No | Maps/calendar | Optional | Foreground only |
| Contacts | Not found | — | — | — | — | |
| Calendar events | Not device calendar sync found | — | — | — | Local reminders ≠ calendar read | |
| App activity / in-app search | Recent searches local | Local AsyncStorage | — | UX | Optional | |
| Web browsing | No in-app browser tracking found | — | — | — | — | |
| App info and performance | No first-party analytics suite found | Firebase may have defaults | Unknown | — | — | **EXTERNAL** Console settings |
| Diagnostics / crash | No Sentry/Crashlytics wiring found | — | — | — | — | Re-check if added |

---

## 2. Data deletion answers (provisional)

| Question theme | Provisional answer from code | Caveat |
|----------------|------------------------------|--------|
| Account creation? | Yes (phone OTP) | |
| In-app deletion? | Yes — Settings → Delete Account & Data | |
| Web deletion resource URL? | Default `…/delete-account` | Verify live page quality |
| Deletes associated data? | Firestore + user Storage prefixes after 15-day grace; Auth deleted (source); soft-delete EXTERNAL | Deploy + Console verification required |
| Additional data retained? | `retiredPhones`, retired UEID index, legal retention TBD | Disclose |
| Request deletion without app? | Mail/web instructions intended | Confirm live site |

---

## 3. Security practices (only if true)

| Practice | Claim allowed from this repo? |
|----------|-------------------------------|
| Data encrypted in transit | HTTPS to Firebase — **typical**; still **EXTERNAL** confirm |
| Data encrypted at rest | **Do not claim** without Google/Firebase confirmation |
| Users can request delete | Yes (with grace) |
| Independent security review | **Not evidenced** |

---

## 4. Consistency requirements

Privacy Policy, Cookie Policy (site), and Data Safety form must use the **same** facts for:

- 15-day grace  
- Firebase processing  
- No sale / no ads in current app build  
- Optional location/photos/notifications  
- User-initiated PDF sharing  
- Support email and deletion URL on `.com`  
- Storage deletion gap until fixed or disclosed as retention  
