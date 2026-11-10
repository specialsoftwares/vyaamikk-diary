package com.specialsoftwares.vyaamikkdiary.crashconsent

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Automatic SDK upload stays off. Acknowledged account/revision authorizes the
 * current process's sanitized records and an exactly owned prior report queue.
 * Unknown, mixed-owner and withdrawn queues are never sent by a later grant.
 * send/deleteUnsentReports in locked Crashlytics 20.0.6 return void; resolving
 * this bridge means the command was accepted, not uploaded/deleted remotely.
 * Signed-device startup, upgrade and account-switch checks — NOT RUN.
 */
class CrashConsentBridgeModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "CrashConsentBridge"

  @ReactMethod fun setSessionReportingEnabled(enabled: Boolean, uid: String?, revision: Double?, promise: Promise) {
    try {
      if (!enabled) {
        CrashConsentRuntime.disable()
        promise.resolve(null)
      } else {
        CrashConsentRuntime.enable(uid, revision) { active ->
          if (active) promise.resolve(null)
          else promise.reject("crash_consent_unavailable", "Crash reporting could not be activated. Restart the app and try again.")
        }
      }
    } catch (error: Throwable) {
      promise.reject("crash_consent_bridge_failed", "Crash reporting is unavailable.", error)
    }
  }

  @ReactMethod fun deleteUnsentReports(promise: Promise) {
    try {
      CrashConsentRuntime.disable(delete = true)
      promise.resolve("deletion_requested")
    } catch (error: Throwable) {
      promise.reject("crash_consent_bridge_failed", "Unsent report deletion could not be requested.", error)
    }
  }
  @ReactMethod fun recordDiagnostic(message: String, promise: Promise) {
    try { CrashConsentRuntime.record(message); promise.resolve(null) }
    catch (error: Throwable) { promise.reject("crash_consent_bridge_failed", "Diagnostic unavailable.", error) }
  }
  @ReactMethod fun logDiagnostic(message: String, promise: Promise) {
    try { CrashConsentRuntime.log(message); promise.resolve(null) }
    catch (error: Throwable) { promise.reject("crash_consent_bridge_failed", "Diagnostic unavailable.", error) }
  }
}
