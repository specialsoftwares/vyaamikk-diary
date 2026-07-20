# DRAFT IN-APP PERMISSION DISCLOSURES

**Status:** PROVISIONAL copy for product/legal alignment · Tip `f1019b6`  
Existing `app.json` strings are already close; this draft standardises wording for consent sheets and Play prominent disclosure review.

---

## Location (foreground only)

**System string (current intent):**  
Vyaamikk Diary can attach optional location footprints to records you save while the app is open, so you can view them on Calendar & Maps. Location is not collected in the background.

**In-App consent (recommended plain language):**  
Optional. If you allow Location Access, we can save a GPS footprint on records you choose while the App is open. You can deny this and still use the App. You can turn location off later in system Settings. We do not track you in the background.

**If denied:** No new GPS footprints; PIN/manual place text still available.

---

## Notifications (local reminders)

**In-App rationale (before OS prompt):**  
Optional. Vyaamikk Diary uses notifications only for reminders you create. We do not send marketing push messages in the current version. You can deny permission and still use the App without reminders.

**If denied:** Reminder scheduling unavailable.

---

## Camera

**System string (current intent):**  
Vyaamikk Diary uses the camera only when you choose to attach a letterhead image, cash-paid receipt photo, or customer photo to your own business records.

**If denied:** Cannot capture new photos; library pick may still work if granted separately.

---

## Photo library

**System string (current intent):**  
Vyaamikk Diary needs access to your photo library so you can attach an official letterhead image for letterhead PDFs. (Also used for other user-chosen attachments where enabled.)

**Photo library add (save exports):**  
Optional save of exported PDFs to your library if you choose.

**If denied:** Attachment from library unavailable; core record-keeping remains.

---

## Microphone

**Do not request. Do not disclose as used.** (`microphonePermission: false`)

---

## Consistency rules

- Never imply background location.  
- Never imply marketing push if only local reminders exist.  
- Never imply photos upload without user action.  
- Align Play Data Safety “optional” flags with these texts.
