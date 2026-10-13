# vc25 phone regressions — issue register

Installed baseline: package `com.specialsoftwares.vyaamikkdiary`, versionName `1.0.0`, versionCode `25`.
Source `680a70190f11e3a59cbe34ed63259214fcf8647a`. EAS `032129f5-f567-4b17-8b9a-ddb85b2a040e`.
Updates are disabled in that manifest (`expo.modules.updates.ENABLED=false`), so the installed JS is the AAB bundle.
Host tests on that SHA do not close these phone reports.

Screenshots were used privately and are not in this repository.

## Navigation

- Entry: `app/(app)/(tabs)/_layout.tsx` native tab bar (`expo-router/unstable-native-tabs`).
- Reproduction: after letterhead and other use, Settings content stayed on screen while You and Saved Records became highlighted. Android Back did not leave Settings. Relaunch restored navigation.
- Observed: tab highlight and the rendered screen disagreed.
- Cause (verified from the navigator): the installed bar is a native bottom navigation whose selection can move without the JS scene. That matches a dropped fragment transaction after an image picker or share sheet returns.
- Correction: JS tabs. The highlight is `state.index`. Android Back returns to the previous tab, then the start tab. Stack screens above the tabs keep their own Back.
- Not claimed: a host test does not prove the phone freeze is gone. That needs the next install.

## Map

- Entry: Calendar & Maps → Map → `DeferredCalendarMapsMapPanel` → `MapView` (`react-native-maps`, `PROVIDER_DEFAULT`).
- Reproduction: tapping Map closes the app immediately.
- Artifact: the vc25 manifest has no `com.google.android.geo.API_KEY`. On Android, creating `MapView` without that key crashes the process.
- Correction: do not mount `MapView` unless that key is present. Empty markers, denied location, and PIN lookup failure already stay in JS. Location is not requested by the map; `showsUserLocation` stays false.
- Required for a working map, not for avoiding the crash: set EAS secret `GOOGLE_MAPS_ANDROID_API_KEY` (restricted to this package) before the next Android build. `app.config.js` copies it into `android.config.googleMaps.apiKey`. No key is stored in the repo.
- Not claimed: the installed vc25 binary still crashes. The guard is in the next bundle.

## Letterhead save

- Entry: `app/(app)/letterhead/setup.tsx` → `createLetterheadSetupEditorRuntime.save` → `firebaseLetterheadRepository.save`.
- Reproduction: a gallery image previewed, then Save letterhead showed “Could not save; your current letterhead is unchanged.” The image was not A4 and was large.
- Cause (verified): every save error except “need image” and “load failed” was replaced with that one sentence, so the upload failure was hidden. The saved template is not replaced when save throws.
- Cause (hypothesis): the hidden error is the Storage upload (`Local file missing` or an HTTP rejection). The screenshot does not include the underlying message.
- Correction: show the specific failure and state that the current template is unchanged. Two placements: header/logo (default; whole image fitted at the top of a white A4 page, no pixel crop, writing area starts below it) and complete letterhead (contain on A4, no stretch). Layout margins stay optional.

## Draft and PDF

- Entry: `app/(app)/letterhead/create.tsx` `onSaveDraft` and `onSubmit`.
- Reproduction: Save draft and Generate & share PDF looked like they did nothing. A logo letter had reached preview. Saved Records showed a Drafts count.
- Cause (verified): success and failure banners render at the top of a long form, off screen from the buttons. Generate returned early when a logo template had no page image. Share errors were discarded. Edit rebound `templateRefUpdatedAt` to the live template.
- Correction: status sits with the buttons and the form scrolls to it. Logo templates can generate. Share cancellation keeps the saved letter. Retry uses the existing idempotent create. Drafts still go through `formDraftsRepository`.

## One active template

- The active template remains the single user config. A new save uploads a new storage object and does not delete the previous object.
- Each new letter stores `templateSnapshot` (layout, placement, storage path, small assets). Replacing the active template does not change that snapshot.
- Older letters with no snapshot are not given a guessed design. If their `templateRefUpdatedAt` still matches the live template, that live template is used. Otherwise export says the original design cannot be reconstructed.

## Presentation

- `composer.summary.cash` was `₹{{amount}}` while `formatINR` already includes `₹`, producing `₹₹5,000`.
- `you.statsThisWeek` is “This week”. The tile uppercased it and clipped the second line to “THIS”.
- Bottom labels were “Calendar & Maps” and “Settings & Info”, which truncate. They are now VyaaFlow, You, Records, Settings. Screen titles stay descriptive. Font scaling stays on.
- Status bar style now follows the resolved theme so light mode uses dark icons.

## Native checks still pending

- Open Map on a phone with the next build (crash gone; tiles only if the maps key is in that build).
- Import a non-A4 header, save it, write a letter.
- Save and reopen a draft.
- Generate, share, and cancel share.
- Replace the template and reopen the older letter.
- Switch every tab and use Android Back.
- Large text and TalkBack.
