package com.specialsoftwares.vyaamikkdiary.phoneauth

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Activity signal for phone sign-in.
 * Reads ReactApplicationContext.currentActivity. Module presence is not a signal.
 * A send or confirm slot stays held while that same Activity is still current,
 * so a second verifyPhoneNumber is not started on top of one that has not finished.
 * The slot is recovered when that Activity is gone or has been replaced.
 */
class PhoneAuthActivityModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var sendGeneration: Int = 0
  private var sendActivityId: Int = 0
  private var confirmGeneration: Int = 0
  private var confirmActivityId: Int = 0

  override fun getName(): String = "PhoneAuthActivity"

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun currentActivitySignal(): String {
    val activity = reactApplicationContext.currentActivity ?: return "missing"
    return "present:" + System.identityHashCode(activity)
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun claimSendSlot(generation: Double): String = claim("send", generation)

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun recoverSendSlot(): String = recover("send")

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun claimConfirmSlot(generation: Double): String = claim("confirm", generation)

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun recoverConfirmSlot(): String = recover("confirm")

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun releaseSendSlot(generation: Double): String = release("send", generation)

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun releaseConfirmSlot(generation: Double): String = release("confirm", generation)

  private fun claim(kind: String, generation: Double): String {
    val activity = reactApplicationContext.currentActivity ?: return "refused:missing"
    val activityId = System.identityHashCode(activity)
    val requested = generation.toInt()
    val heldGeneration = if (kind == "send") sendGeneration else confirmGeneration
    val heldActivityId = if (kind == "send") sendActivityId else confirmActivityId
    if (heldGeneration != 0 && heldGeneration != requested && heldActivityId == activityId) {
      return "refused:in_flight"
    }
    if (kind == "send") {
      sendGeneration = requested
      sendActivityId = activityId
    } else {
      confirmGeneration = requested
      confirmActivityId = activityId
    }
    return "accepted:$activityId"
  }

  private fun release(kind: String, generation: Double): String {
    val requested = generation.toInt()
    val heldGeneration = if (kind == "send") sendGeneration else confirmGeneration
    if (heldGeneration == 0) return "idle"
    if (heldGeneration != requested) return "stale"
    if (kind == "send") {
      sendGeneration = 0
      sendActivityId = 0
    } else {
      confirmGeneration = 0
      confirmActivityId = 0
    }
    return "released"
  }

  private fun recover(kind: String): String {
    val heldGeneration = if (kind == "send") sendGeneration else confirmGeneration
    val heldActivityId = if (kind == "send") sendActivityId else confirmActivityId
    if (heldGeneration == 0) return "idle"
    val activity = reactApplicationContext.currentActivity
    val currentId = if (activity == null) 0 else System.identityHashCode(activity)
    if (currentId != 0 && currentId == heldActivityId) return "held"
    if (kind == "send") {
      sendGeneration = 0
      sendActivityId = 0
    } else {
      confirmGeneration = 0
      confirmActivityId = 0
    }
    return "recovered"
  }
}
