# Next internal build — not started

This packet describes the source correction after `623e7c5`. It does not authorize an AAB, a Play upload, a main merge, billing, purge, or a public track.

## Source

- Branch: `integration/grin-g1-g5-source`
- The candidate is the commit that adds this packet.
- Installed Internal artifact remains versionCode 25, source `680a70190f11e3a59cbe34ed63259214fcf8647a`, EAS `032129f5-f567-4b17-8b9a-ddb85b2a040e`.
- Do not upload that AAB again. Play will reject a second versionCode 25. The next unused versionCode must be read from Play immediately before a new build. The last inventory, for versionCode 25, showed 26 next. That inventory is not a standing authorization to bump.

## Maps

- Secret name only: `GOOGLE_MAPS_ANDROID_API_KEY`.
- Restrict it to package `com.specialsoftwares.vyaamikkdiary` and this app's upload certificate. Do not print the value. Do not widen the restriction to make the check pass.
- `app.config.js` puts that value only in `android.config.googleMaps.apiKey` and sets `extra.androidGoogleMapsConfigured` from the same resolver.
- If the secret is absent, the flag is false and the app must not mount `MapView`. That avoids the crash. It does not show tiles.

## Letterhead

- `expo-image-manipulator` `~14.0.8` is the on-device crop of a working copy. It is not a new data recipient. No remote OCR or AI was added.
- The native gallery save is unverified. No phone was attached.

## Left unchanged

- Billing, purchase entry, quota upsell, purge, public release, Firebase rules, IAM, hosting, and auth domains.
- Do not build an AAB to discover the defects already corrected in this source.
