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
- Correction: JS tabs. The highlight is `state.index`. Android Back is the tab router's `backBehavior="history"`, which pops the visited tabs. The start route is You. Route zero is Calendar, and it is not the empty-history fallback. When history is empty, the router does not handle Back, so the system can leave the app. The tab bar does not call `navigate` on hardware Back. Stack screens above the tabs, including letterhead after a failed save or a cancelled share, pop on their own Back.
- Not claimed: a host test does not prove the phone freeze is gone. That needs the next install.

## Map

- Entry: Calendar & Maps → Map → `DeferredCalendarMapsMapPanel` → `MapView` (`react-native-maps`, `PROVIDER_DEFAULT`).
- Reproduction: tapping Map closes the app immediately.
- Artifact: the vc25 manifest has no `com.google.android.geo.API_KEY`. On Android, creating `MapView` without that key crashes the process.
- Correction: do not mount `MapView` unless `extra.androidGoogleMapsConfigured` is true. That boolean and `android.config.googleMaps.apiKey` are set by the same resolver from `GOOGLE_MAPS_ANDROID_API_KEY`. Runtime code does not read the key. `Constants.expoConfig` does not include `android.config`, so the earlier key read could not see a real manifest key. Empty markers, denied location, and PIN lookup failure already stay in JS. Location is not requested by the map; `showsUserLocation` stays false.
- Required for tiles, not for avoiding the crash: the EAS secret name is `GOOGLE_MAPS_ANDROID_API_KEY`. Play-installed Android is package `com.specialsoftwares.vyaamikkdiary` plus the Play App Signing SHA-1, and the key is restricted to Maps SDK for Android. Do not substitute the upload certificate or its SHA-256. The 2026-10-01 Play App signing read did not store that SHA-1 (it was behind a copy control). Copy it from Play Console → App integrity → App signing key certificate before anyone changes the live credential. This correction does not change that credential. No key is stored in the repo. Without the secret the flag stays false and `MapView` is not mounted. The boolean and the manifest key still come from one resolver.
- Not claimed: a helper test does not prove map tiles. The installed vc25 binary still has no key and still crashes. The guard is in the next bundle.

## Letterhead save

- Entry: `app/(app)/letterhead/setup.tsx` → `createLetterheadSetupEditorRuntime.save` → `firebaseLetterheadRepository.save`.
- Reproduction: a gallery image previewed, then Save letterhead showed “Could not save; your current letterhead is unchanged.” The image was not A4 and was large.
- Cause (verified): every save error except “need image” and “load failed” was replaced with that one sentence, so the upload failure was hidden. The saved template is not replaced when save throws.
- Cause (hypothesis, not a device trace): the hidden error may be the Storage upload. The screenshot does not include the underlying message. No phone was attached while this correction was made (`adb devices` listed none), so the native gallery save is still unverified. The save path now records a privacy-safe stage code (`pick`, `copy`, `sniff`, `crop`, `upload`, `firestore`) and does not put file paths in the message.
- Correction: header placement crops a working copy. The suggestion is the photo's shape, not a reading of the print. Accept and cancel are both available. Complete letterhead stays a separate action and does not crop. Setup preview, letter preview, and the production PDF use the same header band. A saved complete-page template stays complete-page when the sender is edited, including when the saved config arrives after that edit. Deliberate margin edits are kept when the mode changes; an untouched mode change gets that mode's writing margin.

## Crop lifecycle

- Entry: `app/(app)/letterhead/setup.tsx` through `createLetterheadCropController`, and `setCandidate` on the setup editor runtime.
- Before: Use header on the editor's own file, then Cancel, deleted that file. Accept waited on the native crop with no operation id, so Cancel, another image, complete letterhead, or an owner change could still apply the late result. Two Accept presses both started a crop. `setCandidate` checked that the runtime owner was live, and did not check the incoming file's uid and session generation.
- Correction: a file the editor already owns is borrowed. A new gallery or scanner file, and a manipulator output, are disposable. Cancel of a borrowed file leaves it. A disposable file is deleted only when no editor, pending crop, or issued crop still uses it. Saved-template and historical-letter URIs are not deleted. Each accept captures uid, session generation, and an operation id, and takes a single-flight guard before the first await. Cancel, replacement, complete letterhead, owner change, and unmount mark that operation dead and clear the pending image immediately. A late result is discarded and cleaned up. It does not change the current candidate, placement, warnings, or error. `setCandidate` also rejects a file whose uid or generation is not the live owner, without changing the current candidate, and the save path still calls `assertCandidateOwner`. Issued native work is not cancelled.
- Host proof: `letterheadCropSession.test.ts` drives that controller with deferred crop results. Cancellation keeps the current candidate. Two Accept presses start one crop. A newer image or complete letterhead survives the old completion. After A→B and A→logout→A, including completion after the switch, the retired owner cannot display or apply the crop. Geometry-only tests do not cover this.

## Draft and PDF

- Entry: `app/(app)/letterhead/create.tsx` `onSaveDraft` and `onSubmit`.
- Reproduction: Save draft and Generate & share PDF looked like they did nothing. A logo letter had reached preview. Saved Records showed a Drafts count.
- Cause (verified): success and failure banners render at the top of a long form, off screen from the buttons. Generate returned early when a logo template had no page image. Share errors were discarded. Edit rebound `templateRefUpdatedAt` to the live template.
- Correction: status sits with the buttons and the form scrolls to it. Logo templates can generate. Share cancellation keeps the saved letter and does not create another record. Retry uses the existing idempotent create. Saved drafts and recovery snapshots store the template snapshot used for that letter. Reopening after the active template is replaced still previews and exports the original snapshot. A new letter uses the active template. A draft saved before snapshots existed says the original design cannot be recovered and does not borrow the new template. Another account cannot read the snapshot.

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

No device was attached for this correction. Host tests are not phone proof. Native gallery upload, actual map tiles, the document scanner, and Print stay device-pending. None of the following is accepted from host tests.

- Open Map on a phone with the next build (crash gone; tiles only if the maps secret is in that build and restricted as in `NEXT_BUILD_PACKET.md`).
- Choose a photo, accept or adjust the header crop, save the template, and confirm the previous template remains if save fails. Gallery upload itself is still unverified.
- Write a letter, save a draft, see it in Records, reopen it, and generate or share a PDF.
- Cancel share and retry without a duplicate record.
- Replace the active template and confirm the older draft and letter still use the original.
- Switch every tab and use Android Back, including return from letterhead after a failed save or cancelled share.
- Large text and TalkBack.

The next build is not started. See `NEXT_BUILD_PACKET.md`.
