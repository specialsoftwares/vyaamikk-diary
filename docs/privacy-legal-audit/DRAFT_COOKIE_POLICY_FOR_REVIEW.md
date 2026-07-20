# DRAFT COOKIE POLICY — FOR OWNER & COUNSEL REVIEW ONLY

**Status:** PROVISIONAL · **Not for publication** · Tip `f1019b6`

---

## 1. Scope

This Cookie Policy explains storage technologies that may be used on:

**https://vyaamikk.specialsoftwares.com**

and how that relates to the Vyaamikk Diary mobile application.

**Critical limitation:** The Lovable website source is **not** in the mobile application repository. Therefore this draft **does not assert** that the website currently uses analytics cookies, advertising cookies, or no cookies at all.

Complete the questionnaire in `WEBSITE_TRACKING_AUDIT_GAPS.md` before publishing.

---

## 2. What are cookies and similar technologies?

Cookies are small text files stored by a browser. Similar technologies include localStorage, sessionStorage, pixels, and SDKs.

The **mobile App** primarily uses on-device storage (SecureStore, AsyncStorage, SQLite), not browser cookies.

---

## 3. Website — currently verified vs unverified

### Verified from the mobile repository

- The App links to Privacy, Terms, Support, Contact, Delete Account, Download, and Home on the `.com` origin.  
- `/auth` is a developer integration route and must not be an end-user destination.

### Not verified (do not publish as fact until audited)

- Whether first-party cookies are set  
- Whether Lovable/host analytics cookies exist  
- IP log retention by the host  
- Embedded video players and their cookies  
- Contact/support form storage  

**[EXTERNAL VERIFICATION REQUIRED: website cookies, localStorage, analytics tags, IP logs]**

---

## 4. Categories (template — activate only after audit)

| Category | Examples | When allowed |
|----------|----------|--------------|
| Strictly necessary | Load balancing, security, consent preference | Always if present |
| Preferences | Language UI on site | If used |
| Analytics | Host/project analytics | Only with disclosed purpose and any required consent |
| Marketing | Ad pixels | **Not part of current mobile product;** disclose only if website adds them |
| Embedded media | YouTube/Vimeo | Only if embeds exist |

---

## 5. Mobile App storage (not cookies)

The App stores session, preferences, drafts, and business records on device and may sync to Firebase. See the Privacy Policy.

---

## 6. Managing cookies

Browser controls can block cookies. Blocking may break site features.  
**[OWNER CONFIRMATION REQUIRED: whether a consent banner will be implemented]**

---

## 7. Contact

support.vyd@specialsoftwares.com  
**Effective date:** [OWNER CONFIRMATION REQUIRED]

---

## Clean-publication checklist

- [ ] Website audit questionnaire completed  
- [ ] Cookie table filled with real names/durations  
- [ ] No claim of “we don’t use cookies” unless proven  
- [ ] No claim of analytics cookies unless proven  
- [ ] Counsel sign-off · hosted if required
