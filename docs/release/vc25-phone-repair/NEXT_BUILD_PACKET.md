# Next internal build — not started

This packet describes the source correction after `3be660d600001a170537bc93175d7e2672a08046`. It does not authorize an AAB, a Play upload, a main merge, billing, purge, or a public track. It does not change the live Maps credential.

## Source

- Branch: `integration/grin-g1-g5-source`
- The candidate is the commit that adds this packet.
- Installed Internal artifact remains versionCode 25, source `680a70190f11e3a59cbe34ed63259214fcf8647a`, EAS `032129f5-f567-4b17-8b9a-ddb85b2a040e`.
- Do not upload that AAB again. Play will reject a second versionCode 25. The next unused versionCode must be read from Play immediately before a new build. The last inventory, for versionCode 25, showed 26 next. That inventory is not a standing authorization to bump.
- Existing build and upload permissions stay as they are. This packet does not grant a new one.

## Maps

Play-installed Android uses package `com.specialsoftwares.vyaamikkdiary` and the Play App Signing certificate. The Android Maps restriction is that package plus the SHA-1 of the Play App Signing certificate, and the API restriction is Maps SDK for Android only.

Do not substitute the upload certificate. Do not substitute the upload certificate's SHA-256. Do not use the Play App Signing SHA-256 that Digital Asset Links uses. Do not print the API key.

Certificate provenance, from the 2026-10-01 Play App signing read: the App signing key certificate SHA-1 was behind a copy control and was not stored. The upload-key fingerprints and the Play App Signing SHA-256 were stored for other checks. They are not this restriction. A Firebase Android SHA-1 recorded beside that audit was not matched to the Play App Signing certificate, so it is not entered here either.

Concrete action, not performed by this packet:

1. Open the Google Cloud credential whose value is the EAS secret `GOOGLE_MAPS_ANDROID_API_KEY`.
2. Set the application restriction to Android apps.
3. Add package `com.specialsoftwares.vyaamikkdiary` with the SHA-1 copied at that time from Play Console → App integrity → App signing key certificate.
4. Set the API restriction to Maps SDK for Android only.
5. Leave the upload key off that restriction.

`src/services/maps/androidMapsBuildConfig.js` is the one resolver. It sets `extra.androidGoogleMapsConfigured` and, only when the secret is non-empty, `android.config.googleMaps.apiKey`. Runtime code reads the boolean only. If the secret is absent, the flag is false and the app must not mount `MapView`. That avoids the crash. It does not show tiles.

## Letterhead

- `expo-image-manipulator` `~14.0.8` is the on-device crop of a working copy. It is not a new data recipient. No remote OCR or AI was added.
- Cancel keeps the image the editor already owns. Disposable crop files are removed only when nothing active still uses them. A late crop is ignored after cancel, replacement, complete letterhead, owner change, or unmount. Issued native work is not cancelled. The retained original follows the currently accepted image. Choosing complete letterhead on a replacement, then choosing it again, keeps that replacement.
- The native gallery save is unverified. No phone was attached.

## Still device-pending

Native gallery upload, actual map tiles, the document scanner, and Print. Host tests do not close them.

## Left unchanged

- Billing, purchase entry, quota upsell, purge, public release, Firebase rules, IAM, hosting, and auth domains.
- Accepted draft snapshots, PDF layout, navigation, and GRIN.
- Do not build an AAB to discover the defects already corrected in this source.
