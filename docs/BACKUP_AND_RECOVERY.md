# Vyaamikk Diary — Firestore Backup and Recovery Runbook

Operational guide for protecting production Firestore data on the **vyaamikk-diary** Firebase project (Blaze plan).

## 1. Scope

- Firebase Blaze production project: **vyaamikk-diary**
- Cloud Firestore production database
- Cloud Firestore backups, Point-in-Time Recovery (PITR), and scheduled exports
- Does **not** replace app-level deletion/retention policy in Vyaamikk Diary
- Does **not** automatically backup Firebase Auth users or Firebase Storage objects

## 2. Enable Point-in-Time Recovery (PITR)

PITR is configured in the Firebase Console — it cannot be enabled from this app codebase.

1. Open [Firebase Console](https://console.firebase.google.com/)
2. Select project: **vyaamikk-diary**
3. Go to **Firestore Database**
4. Open **Disaster Recovery** / **Backups** / **PITR** (console UI label may vary)
5. Enable **Point-in-Time Recovery** for the production database
6. Confirm billing warning (Blaze required)
7. Save
8. Record enablement date in your ops log

## 3. Daily scheduled Firestore exports

**Recommended bucket:** `gs://vyaamikk-diary-firestore-backups`

**Recommended region:** Same region as your Firestore database (finalize Firestore location before production if not already set).

**Recommended schedule:** Daily at **2:00 AM IST**

Configure via Google Cloud Console → Cloud Scheduler + Firestore export job, or `gcloud` automation documented below.

## 4. IAM role

Grant export permission to the service account used by Firestore export (often the App Engine default service account or Firestore service agent):

**Role:** `roles/datastore.importExportAdmin`

Also ensure the service account can **write to the GCS backup bucket** (Storage Object Admin or bucket-specific IAM as required).

## 5. GCS lifecycle retention

On bucket `vyaamikk-diary-firestore-backups`:

- **Keep 30 days** of export objects
- **Delete** older exports automatically via GCS Lifecycle Rules

## 6. Manual emergency export

```bash
gcloud firestore export gs://vyaamikk-diary-firestore-backups/manual-$(date +%Y%m%d-%H%M%S) --project=vyaamikk-diary
```

If your project uses a non-default database ID, add the database flag per current `gcloud firestore export --help` output.

## 7. Restore caution

- **Never** restore over production without a written decision and rollback plan
- Restore to a **staging** project or database first
- Verify **Firebase Auth** users separately — Firestore export does not restore Auth
- Verify **Firebase Storage** objects separately — Firestore export does not restore Storage
- Re-run app smoke tests after any restore drill

## 8. Operator checklist

- [ ] PITR enabled (date recorded)
- [ ] Backup bucket `vyaamikk-diary-firestore-backups` created
- [ ] IAM `datastore.importExportAdmin` granted
- [ ] Daily export schedule active
- [ ] GCS lifecycle rule (30-day retention) active
- [ ] Manual export tested once
- [ ] Quarterly restore drill scheduled

## Related deploy (Storage rules)

```bash
firebase deploy --only functions,firestore:rules,firestore:indexes,storage --project vyaamikk-diary
```

Do not deploy unless explicitly authorized for the target environment.
