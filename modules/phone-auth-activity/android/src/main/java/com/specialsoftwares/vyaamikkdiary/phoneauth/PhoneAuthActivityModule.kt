package com.specialsoftwares.vyaamikkdiary.phoneauth

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.firebase.FirebaseException
import com.google.firebase.FirebaseTooManyRequestsException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthException
import com.google.firebase.auth.PhoneAuthCredential
import com.google.firebase.auth.PhoneAuthOptions
import com.google.firebase.auth.PhoneAuthProvider
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Owns Android phone callbacks before they may mutate FirebaseAuth.
 * Activity replacement is NOT cancellation of a credential task. There is one
 * process-wide credential task gate, retained until the Firebase task settles.
 * Retired verification callbacks cannot start a credential task. A late task
 * cannot publish a completion proof. No callback signs out a replacement user.
 */
class PhoneAuthActivityModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private class Attempt(val generation: Int, val phone: String, val promise: Promise) {
    var verificationId = ""
    var settled = false
    var retired = false
  }

  companion object {
    private val guard = Any()
    private var sendGeneration = 0
    private var sendActivityId = 0
    private var confirmGeneration = 0
    private var confirmActivityId = 0
    private var activeSend: Attempt? = null
    private var activeConfirm: Attempt? = null
    private var credentialTask: Attempt? = null
    private var resendPhone: String? = null
    private var resendToken: PhoneAuthProvider.ForceResendingToken? = null
    private var proof: String? = null
  }

  override fun getName(): String = "PhoneAuthActivity"

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun currentActivitySignal(): String {
    val activity = reactApplicationContext.currentActivity ?: return "missing"
    return "present:" + System.identityHashCode(activity)
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun claimSendSlot(generation: Double): String = claim("send", generation)
  @ReactMethod(isBlockingSynchronousMethod = true)
  fun claimConfirmSlot(generation: Double): String = claim("confirm", generation)
  @ReactMethod(isBlockingSynchronousMethod = true)
  fun recoverSendSlot(): String = synchronized(guard) {
    if (sendGeneration != 0 || credentialTask != null || confirmGeneration != 0) "held" else "idle"
  }
  @ReactMethod(isBlockingSynchronousMethod = true)
  fun recoverConfirmSlot(): String = synchronized(guard) {
    if (confirmGeneration != 0 || credentialTask != null || sendGeneration != 0) "held" else "idle"
  }
  @ReactMethod(isBlockingSynchronousMethod = true)
  fun releaseSendSlot(generation: Double): String = release("send", generation)
  @ReactMethod(isBlockingSynchronousMethod = true)
  fun releaseConfirmSlot(generation: Double): String = release("confirm", generation)

  private fun claim(kind: String, generation: Double): String = synchronized(guard) {
    val activity = reactApplicationContext.currentActivity ?: return@synchronized "refused:missing"
    if (credentialTask != null || sendGeneration != 0 || confirmGeneration != 0) {
      return@synchronized "refused:in_flight"
    }
    val requested = generation.toInt()
    if (requested <= 0) return@synchronized "refused:stale"
    val activityId = System.identityHashCode(activity)
    if (kind == "send") {
      sendGeneration = requested
      sendActivityId = activityId
    } else {
      confirmGeneration = requested
      confirmActivityId = activityId
    }
    "accepted:$activityId"
  }

  private fun release(kind: String, generation: Double): String = synchronized(guard) {
    val requested = generation.toInt()
    val held = if (kind == "send") sendGeneration else confirmGeneration
    if (held == 0) return@synchronized "idle"
    if (held != requested) return@synchronized "stale"
    if (kind == "send") { sendGeneration = 0; sendActivityId = 0 }
    else { confirmGeneration = 0; confirmActivityId = 0 }
    // This does not release credentialTask. Only its onComplete listener can.
    "released"
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun retireSend(generation: Double): Boolean = synchronized(guard) {
    val attempt = activeSend
    if (attempt != null && attempt.generation == generation.toInt()) {
      attempt.retired = true
      proof = null
      reject(attempt, "auth/cancelled-request")
    }
    // Callbacks test attempt identity before authentication, so retiring a
    // verification listener is safe. Already-started credential tasks stay held.
    release("send", generation)
    true
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun retireConfirm(generation: Double): Boolean = synchronized(guard) {
    val attempt = activeConfirm
    if (attempt != null && attempt.generation == generation.toInt()) {
      attempt.retired = true
      reject(attempt, "auth/cancelled-request")
    }
    proof = null
    release("confirm", generation)
    true
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun verificationProof(verificationId: String): String? = synchronized(guard) {
    val value = proof ?: return@synchronized null
    if (JSONObject(value).optString("verificationId") == verificationId) value else null
  }

  @ReactMethod
  fun startPhoneVerification(phone: String, generation: Double, forceResend: Boolean, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      synchronized(guard) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null || System.identityHashCode(activity) != sendActivityId) {
          release("send", generation)
          promise.reject("auth/missing-activity", "Phone verification needs the sign-in screen.")
          return@synchronized
        }
        if (sendGeneration != generation.toInt() || credentialTask != null) {
          promise.reject("auth/cancelled-request", "This verification request is no longer current.")
          return@synchronized
        }
        activeSend?.retired = true
        proof = null
        val attempt = Attempt(generation.toInt(), phone, promise)
        activeSend = attempt
        if (resendPhone != phone) { resendPhone = phone; resendToken = null }
        val callbacks = object : PhoneAuthProvider.OnVerificationStateChangedCallbacks() {
          override fun onCodeSent(id: String, token: PhoneAuthProvider.ForceResendingToken) {
            synchronized(guard) {
              if (activeSend !== attempt || attempt.retired) return
              attempt.verificationId = id
              resendToken = token
              resolveSend(attempt)
            }
          }
          override fun onVerificationCompleted(credential: PhoneAuthCredential) {
            synchronized(guard) {
              if (activeSend !== attempt || attempt.retired || credentialTask != null) return
              if (attempt.verificationId.isEmpty()) attempt.verificationId = "instant:${attempt.generation}"
              authenticate(attempt, credential, true)
            }
          }
          override fun onVerificationFailed(error: FirebaseException) {
            synchronized(guard) {
              if (activeSend === attempt && !attempt.retired) reject(attempt, errorCode(error))
            }
          }
          override fun onCodeAutoRetrievalTimeOut(id: String) {
            synchronized(guard) {
              if (activeSend !== attempt || attempt.retired) return
              if (!attempt.settled) {
                attempt.verificationId = id
                resolveSend(attempt)
              }
            }
          }
        }
        try {
          val options = PhoneAuthOptions.newBuilder(FirebaseAuth.getInstance())
            .setPhoneNumber(phone).setTimeout(60L, TimeUnit.SECONDS)
            .setActivity(activity).setCallbacks(callbacks)
          if (forceResend) resendToken?.let { options.setForceResendingToken(it) }
          PhoneAuthProvider.verifyPhoneNumber(options.build())
        } catch (error: Exception) {
          reject(attempt, errorCode(error))
        }
      }
    }
  }

  @ReactMethod
  fun confirmPhoneVerification(id: String, code: String, phone: String, generation: Double, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      synchronized(guard) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null || System.identityHashCode(activity) != confirmActivityId) {
          release("confirm", generation)
          promise.reject("auth/missing-activity", "Phone verification needs the sign-in screen.")
          return@synchronized
        }
        if (confirmGeneration != generation.toInt() || credentialTask != null) {
          promise.reject("auth/cancelled-request", "This verification request is no longer current.")
          return@synchronized
        }
        // A manual confirmation supersedes only the automatic callback. It
        // does not cancel an already-started credential task (checked above).
        activeSend?.retired = true
        proof = null
        val attempt = Attempt(generation.toInt(), phone, promise)
        attempt.verificationId = id
        activeConfirm = attempt
        try { authenticate(attempt, PhoneAuthProvider.getCredential(id, code), false) }
        catch (error: Exception) { reject(attempt, errorCode(error)) }
      }
    }
  }

  /** Phone replacement keeps the current UID and shares the credential barrier. */
  @ReactMethod
  fun updateVerifiedPhone(id: String, code: String, phone: String, expectedUid: String, generation: Double, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      synchronized(guard) {
        val activity = reactApplicationContext.currentActivity
        val auth = FirebaseAuth.getInstance()
        val user = auth.currentUser
        if (activity == null || System.identityHashCode(activity) != confirmActivityId ||
          confirmGeneration != generation.toInt() || credentialTask != null || user == null || user.uid != expectedUid) {
          promise.reject("auth/cancelled-request", "Your sign-in changed. Please try again.")
          return@synchronized
        }
        activeSend?.retired = true
        proof = null
        val attempt = Attempt(generation.toInt(), phone, promise)
        attempt.verificationId = id
        activeConfirm = attempt
        credentialTask = attempt
        val task = try { user.updatePhoneNumber(PhoneAuthProvider.getCredential(id, code)) }
        catch (error: Exception) { credentialTask = null; reject(attempt, errorCode(error)); return@synchronized }
        task.addOnCompleteListener { completed ->
          synchronized(guard) {
            if (credentialTask === attempt) credentialTask = null
            if (attempt.retired || activeConfirm !== attempt || auth.currentUser?.uid != expectedUid) {
              reject(attempt, "auth/cancelled-request")
            } else if (!completed.isSuccessful) {
              reject(attempt, errorCode(completed.exception))
            } else if (auth.currentUser?.phoneNumber != phone) {
              reject(attempt, "auth/invalid-credential")
            } else if (!attempt.settled) {
              attempt.settled = true
              attempt.promise.resolve(expectedUid)
            }
          }
        }
      }
    }
  }

  private fun authenticate(attempt: Attempt, credential: PhoneAuthCredential, automatic: Boolean) {
    credentialTask = attempt
    val task = try { FirebaseAuth.getInstance().signInWithCredential(credential) }
    catch (error: Exception) { credentialTask = null; reject(attempt, errorCode(error)); return }
    task.addOnCompleteListener { task ->
      synchronized(guard) {
        if (credentialTask === attempt) credentialTask = null
        val owned = !attempt.retired && if (automatic) activeSend === attempt else activeConfirm === attempt
        if (!owned) { reject(attempt, "auth/cancelled-request"); return@synchronized }
        val user = if (task.isSuccessful) task.result?.user else null
        if (!task.isSuccessful || user == null) {
          reject(attempt, errorCode(task.exception))
          return@synchronized
        }
        if (user.phoneNumber != attempt.phone) {
          reject(attempt, "auth/invalid-credential")
          return@synchronized
        }
        if (automatic) {
          proof = JSONObject().put("verificationId", attempt.verificationId)
            .put("uid", user.uid).put("phone", attempt.phone).toString()
          resolveSend(attempt)
          // A torn-down JS context cannot receive this wake-up. The proof is
          // already stored; a later observer can read it without replaying auth.
          try {
            reactApplicationContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
              .emit("VydPhoneVerificationCompleted", null)
          } catch (_: RuntimeException) { }
        } else if (!attempt.settled) {
          attempt.settled = true
          attempt.promise.resolve(user.uid)
        }
      }
    }
  }

  private fun resolveSend(attempt: Attempt) {
    if (attempt.settled) return
    attempt.settled = true
    val result = Arguments.createMap()
    result.putString("verificationId", attempt.verificationId)
    attempt.promise.resolve(result)
  }

  private fun reject(attempt: Attempt, code: String) {
    if (attempt.settled) return
    attempt.settled = true
    attempt.promise.reject(code, "Phone verification could not be completed.")
  }

  private fun errorCode(error: Exception?): String {
    if (error is FirebaseTooManyRequestsException) return "auth/too-many-requests"
    if (error is FirebaseAuthException) return "auth/" + error.errorCode.removePrefix("ERROR_")
      .lowercase().replace('_', '-')
    return "auth/network-request-failed"
  }
}
