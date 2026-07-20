# PLAY REVIEW CREDENTIAL ROTATION CHECKLIST

Use after Play review completes, if credentials leak, or on a fixed schedule.

---

## 1. Firebase

1. Firebase Console → `vyaamikk-diary` → Authentication → Sign-in method → Phone → **Phone numbers for testing**  
2. Remove or replace `[REVIEW PHONE E.164 — DO NOT COMMIT]`  
3. If replacing: choose a new India-compatible fictional number + new fixed code  
4. Confirm old number cannot sign in with the old code  
5. If the Auth user / Firestore profile for the old review account should be retired, follow normal account-deletion / ops process (do not leave orphan demo PII longer than needed)

---

## 2. Google Play Console

1. Play Console → App content → Sign-in details  
2. Clear or update stored phone / OTP / instructions  
3. Never paste credentials into public store listing text  

---

## 3. Internal hygiene

- [ ] Remove credentials from password-manager “shared” spaces if review ended  
- [ ] Confirm Git history / docs still contain **placeholders only**  
- [ ] Confirm no screenshots of OTP screens with visible codes in public channels  
- [ ] Confirm support inbox not used as a standing OTP channel  

---

## 4. If a new review cycle starts

1. Create fresh Firebase test number (India rules)  
2. Re-run account setup runbook + manual QA matrix  
3. Update Play Sign-in details  
4. Do not reuse weak codes (`123456`, `000000`) if avoidable  

---

## Confirmation log (private)

| Event | Date | Operator |
|-------|------|----------|
| Credentials created | | |
| Submitted to Play | | |
| Rotated / removed | | |
