package com.specialsoftwares.vyaamikkdiary.crashconsent

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.firebase.crashlytics.FirebaseCrashlytics

/**
 * Signed-device checks — NOT RUN. This source is not evidence that they passed.
 * After a signed build that includes this module:
 * - Allow enables collection only in the current process.
 * - Force-stop, then relaunch, stays disabled until Allow again.
 * - Withdrawal disables collection.
 * - Switching accounts does not keep the previous grant.
 * - logcat or a debug readout must show the RNFirebase auto-collection preference false.
 *
 * Calls FirebaseCrashlytics.setCrashlyticsCollectionEnabled on the running SDK only.
 * Does not write ReactNativeFirebasePreferences KEY_CRASHLYTICS_AUTO_COLLECTION_ENABLED.
 * deleteUnsentReports() has no completion proof; the JS status stays "deletion requested".
 * Do not call sendUnsentReports. Do not claim uploaded reports were deleted.
 */
class CrashConsentBridgeModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "CrashConsentBridge"

  @ReactMethod
  fun setSdkCollectionEnabled(enabled: Boolean, promise: Promise) {
    try {
      FirebaseCrashlytics.getInstance().setCrashlyticsCollectionEnabled(enabled)
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("crash_consent_bridge_failed", "runtime collection update failed", error)
    }
  }

  @ReactMethod
  fun deleteUnsentReports(promise: Promise) {
    try {
      FirebaseCrashlytics.getInstance().deleteUnsentReports()
      promise.resolve("deletion_requested")
    } catch (error: Throwable) {
      promise.reject("crash_consent_bridge_failed", "unsent deletion request failed", error)
    }
  }

  @ReactMethod
  fun recordDiagnostic(message: String, promise: Promise) {
    try {
      FirebaseCrashlytics.getInstance().recordException(CrashConsentDiagnostic(message.take(200)))
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("crash_consent_bridge_failed", "diagnostic record failed", error)
    }
  }

  @ReactMethod
  fun logDiagnostic(message: String, promise: Promise) {
    try {
      FirebaseCrashlytics.getInstance().log(message.take(120))
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("crash_consent_bridge_failed", "diagnostic log failed", error)
    }
  }
}

private class CrashConsentDiagnostic(message: String) : Exception(message)
