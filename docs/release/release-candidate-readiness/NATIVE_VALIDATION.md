# Local Android native validation — 10 November 2026

## Result and source boundary

Local app Kotlin/Java compilation, five production Kotlin queue-policy tests, and release R8 minification passed. This is **not** an assembled or signed AAB, EAS build, deployment, canonical CI result, or device acceptance.

The app/native/plugin source validated is commit `10c846a22e2606e2f740a6101a12db6e5eee8bb5`. The later commits `9ef0c778154ded9be6703e68c3d53d4c0a9f6a6a` and `578c229ca270237014dd71ead92b33bbd30feaa5` change Functions, package test scripts, and documentation; the native sources below match all three commits and the generated Android copies byte for byte. The Android project is generated and ignored.

| Check | Result | Evidence |
| --- | --- | --- |
| `:app:compileReleaseKotlin` | Passed | Actual app compilation completed; only deprecation warnings. App Java compilation and release class JAR tasks also completed. |
| `:app:testReleaseUnitTest` | Passed | `CrashQueuePolicyTest`: 5 tests, 0 failures, 0 errors, 0 skipped; XML timestamp `2026-11-10T11:41:30.367Z`. |
| `:app:minifyReleaseWithR8` | Passed in a separate local-only run | Exit 0; `BUILD SUCCESSFUL in 4m 33s`; 541 actionable tasks, 11 executed and 530 up-to-date. The minifier task was deliberately forced to execute. |
| Release JS bundling | Passed | Final local-only run bundled 4,307 modules and copied 94 assets. |

The five JVM tests execute the production `crashQueueAction` policy for an unknown legacy queue, an exact prior owner/revision, another owner or revision, quarantine, and an empty queue. They do not prove Android startup ordering at runtime, SDK transmission/deletion, SMS receipt, or successful reactivation on a handset.

## Effective toolchain

| Component | Actual version |
| --- | --- |
| JDK | Temurin 21.0.13+9, including `javac` |
| Gradle / Android Gradle Plugin | 8.14.3 / 8.11.0 |
| Kotlin Gradle plugin / compiler | 2.2.20 / `kotlin-compiler-embeddable-2.2.20.jar` |
| KSP | 2.2.20-2.0.3 |
| R8 | 8.13.19 |
| Compile / target / minimum SDK | 36 / 36 / 24 |
| Firebase BoM / Auth | 34.14.0 / 24.1.0 |
| Crashlytics / Crashlytics NDK | 20.0.6 / 20.0.6 |

The actual app plugin classloaders reported KGP 2.2.20 and R8 8.13.19; the resulting mapping header independently confirms:

```text
# compiler: R8
# compiler_version: 8.13.19
# min_api: 24
```

The original app compiler rejected Firebase Auth's Kotlin 2.3 metadata. Changing only Expo's displayed Kotlin version did not change the effective KGP dependency. The source correction pins the actual root KGP and the matching Expo/KSP version, and supplies the supported R8 override. A version-and-source-hash guarded prebuild transform corrects exactly four activity-getter expressions in datetimepicker 8.4.4. No metadata check was disabled and no Expo, Firebase, or datetimepicker package version was upgraded.

R8 emitted 21 invalid-stack-map warnings for `play-services-auth:21.5.0`; they were not suppressed. The minifier nevertheless exited successfully. Signed-device authentication remains a separate acceptance requirement.

## Local-only configuration and rejected earlier run

Prebuild used an explicitly synthetic Firebase file for project `demo-vyaamikk-rc`, with package `com.specialsoftwares.vyaamikkdiary`. This does not validate the production EAS Firebase file, credentials, signing certificate, or backend connection. The generated configuration carries versionName 1.0.0 and the already-used versionCode 34. No version was reserved or uploaded; a signed build requires a fresh unused code from Play/EAS inventory.

An earlier workflow continuation was rejected by automatic approval review because it identified a risk of uploading private Crashlytics native symbols without authorization. That workflow was not resumed. Its managed process was subsequently unavailable, and its local log showed neither an upload task nor a successful final footer; those facts are not a claim that the rejected workflow completed minification.

A **new** materially safer run first passed an offline dry-run and then executed offline with scratch-only controls:

- Crashlytics mapping and native-symbol upload flags were false for debug, debugOptimized, and release.
- Every upload/publish task was disabled and excluded; a task-graph guard rejected execution if any remained.
- Both dry-run and execution reported `VYD_LOCAL_ONLY_PLANNED_UPLOAD_TASKS=0` for the 600-task main graph.
- One Gradle worker, Kotlin in-process, and one Metro worker bounded memory use. The bundle task remained in the required task graph.
- Production source configuration was unchanged by these local-only controls. No upload task executed in the successful run.

## Immutable native-source fingerprints

SHA-256 is calculated from the original committed source. Every generated Android copy and current worktree file matched that source. The first five files are production Kotlin; the final file is the JVM regression suite.

| Source file | SHA-256 | Generated copy |
| --- | --- | --- |
| `PhoneAuthActivityModule.kt` | `07fcc27313b8312201cd904c9d54eebcd08c6b432d2ca2ddc363031e79044aa4` | Match |
| `PhoneAuthActivityPackage.kt` | `5af232d6ec0d88d1abd79da4aa2ed9924f908e1257bb6bf87c8645da34725ff5` | Match |
| `CrashConsentBootstrap.kt` | `19235cf0149c2965ec6b3e887dfe9143caa7bb8810b5786befd6e94c302270f7` | Match |
| `CrashConsentBridgeModule.kt` | `427a39af102dcd12e320d55498ddb46ee18b45f302850191f153299250640f91` | Match |
| `CrashConsentBridgePackage.kt` | `278833f8bfda1f0c7d121f3092e3e1e1b327c23ebb93f8a74b94bcce90b79c0b` | Match |
| `CrashQueuePolicyTest.kt` | `d6669de9070642d0408186e294c2a75203ffc671067aa3d78b41a8512b7fca77` | Match |

Source roots are `modules/phone-auth-activity/android/src/main/java/.../phoneauth`, `modules/crash-consent/android/src/main/java/.../crashconsent`, and `modules/crash-consent/android/src/test/java/.../crashconsent`.

## Evidence retained locally

The sanitized lines above come from `android-toolchain/native-validation-metro-bounded.log`, `local-only-minify-preflight.log`, and `local-only-minify-result.log`, plus the generated JUnit XML and mapping header. Full mapping files and private build artifacts are not committed here. No phone was attached; no live SMS/email attempt, backend deployment, signed build, Play upload, or handset acceptance occurred during this validation.
