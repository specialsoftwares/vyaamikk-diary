package com.specialsoftwares.vyaamikkdiary.crashconsent

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.Handler
import android.os.Looper
import java.util.concurrent.atomic.AtomicBoolean
import com.google.firebase.crashlytics.FirebaseCrashlytics
import java.security.MessageDigest

/**
 * Migration is deliberately pinned to Crashlytics 20.0.6 and RNFirebase 24.1.0.
 * The SDK has no public pre-initialization reset API. These are the exact keys
 * read by DataCollectionArbiter and UniversalFirebasePreferences in those versions.
 * The config plugin pins/guards both dependencies and installs this provider
 * before FirebaseInitProvider (100) and RNFirebase providers (99/98).
 * Never initialize Firebase from this provider: clear overrides BEFORE its init.
 */
class CrashConsentBootstrap : ContentProvider() {
  override fun onCreate(): Boolean {
    val context = context ?: return false
    CrashConsentRuntime.prepare(context)
    return true
  }
  override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor? = null
  override fun getType(uri: Uri): String? = null
  override fun insert(uri: Uri, values: ContentValues?): Uri? = null
  override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0
  override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = 0
}

/** Pure policy: an uncertain queue is NEVER made sendable by a new grant. */
internal fun crashQueueAction(hasReports: Boolean, priorScope: String?, scope: String, quarantined: Boolean): String =
  if (!hasReports) "empty" else if (!quarantined && priorScope == scope) "send" else "delete"

internal object CrashConsentRuntime {
  private const val LEDGER = "vyd_crash_consent_queue_v1"
  private var context: Context? = null
  private var ready = false
  private var priorScope: String? = null
  private var priorQuarantine = true
  private var currentScope: String? = null
  private var firstScope: String? = null
  private var mixed = false
  private var generation = 0L
  private var reports: Boolean? = null
  private var checkStarted = false
  private var reportAction: String? = null
  private val pending = mutableListOf<() -> Unit>()

  @Synchronized fun prepare(appContext: Context) {
    context = appContext.applicationContext
    val ledger = appContext.getSharedPreferences(LEDGER, Context.MODE_PRIVATE)
    priorScope = ledger.getString("scope", null)
    priorQuarantine = ledger.getBoolean("quarantined", true)
    // A process that dies before an acknowledged grant leaves an unowned queue.
    val ledgerStored = ledger.edit().remove("scope").putBoolean("quarantined", true).commit()
    val sdkStored = appContext.getSharedPreferences("com.google.firebase.crashlytics", Context.MODE_PRIVATE)
      .edit().putBoolean("firebase_crashlytics_collection_enabled", false).commit()
    val wrapperStored = appContext.getSharedPreferences("io.invertase.firebase", Context.MODE_PRIVATE)
      .edit().putBoolean("crashlytics_auto_collection_enabled", false).commit()
    // commit also updates the current-process preference cache on disk failure.
    // In that case refuse explicit reporting; the next process retries migration.
    ready = sdkStored && wrapperStored && ledgerStored
  }

  private fun scope(uid: String, revision: Double): String {
    val bytes = MessageDigest.getInstance("SHA-256").digest("$uid:$revision".toByteArray(Charsets.UTF_8))
    return bytes.joinToString("") { "%02x".format(it) }
  }

  @Synchronized private fun persistScope(value: String?, quarantined: Boolean): Boolean {
    val ctx = context ?: return false
    return ctx.getSharedPreferences(LEDGER, Context.MODE_PRIVATE).edit()
      .putString("scope", value).putBoolean("quarantined", quarantined).commit()
  }

  @Synchronized fun disable(delete: Boolean = false) {
    generation += 1
    if (delete && firstScope != null) mixed = true
    currentScope = null
    persistScope(null, true)
    // This code NEVER enables the persistent automatic upload override.
    FirebaseCrashlytics.getInstance().setCrashlyticsCollectionEnabled(false)
    if (delete) {
      if (reportAction == null) reportAction = "delete"
      FirebaseCrashlytics.getInstance().deleteUnsentReports()
    }
  }

  @Synchronized fun enable(uid: String?, revision: Double?, done: (Boolean) -> Unit) {
    if (!ready || uid.isNullOrBlank() || revision == null || !revision.isFinite() || revision < 0 || revision % 1 != 0.0) {
      done(false); return
    }
    val requested = scope(uid, revision)
    if (firstScope != null && firstScope != requested) mixed = true
    firstScope = firstScope ?: requested
    if (mixed) { done(false); return }
    val claim = ++generation
    val settled = AtomicBoolean(false)
    val handler = Handler(Looper.getMainLooper())
    val timeout = Runnable {
      synchronized(this) {
        if (generation == claim) { generation += 1; currentScope = null; persistScope(null, true) }
        if (settled.compareAndSet(false, true)) done(false)
      }
    }
    val finish: (Boolean) -> Unit = { active ->
      if (settled.compareAndSet(false, true)) { handler.removeCallbacks(timeout); done(active) }
    }
    handler.postDelayed(timeout, 20_000L)
    val activate = {
      synchronized(this) {
        if (generation != claim || mixed || settled.get()) {
          finish(false)
        } else {
          val available = reports
          if (available == null) {
            finish(false)
          } else {
            val action = crashQueueAction(available, priorScope, requested, priorQuarantine)
            if (reportAction == null) {
              reportAction = action
              when (action) {
                "send" -> FirebaseCrashlytics.getInstance().sendUnsentReports()
                "delete" -> FirebaseCrashlytics.getInstance().deleteUnsentReports()
              }
            }
            // A void deletion call is not a receipt. Preserve quarantine until
            // a subsequent process observes no unsent reports; never upload it.
            val quarantine = action == "delete" || reportAction == "delete"
            if (persistScope(requested, quarantine)) {
              currentScope = requested
              finish(true)
            } else {
              currentScope = null
              finish(false)
            }
          }
        }
      }
    }
    if (reports != null) { activate(); return }
    pending.add(activate)
    if (checkStarted) return
    checkStarted = true
    // Public API permits one check per process. Failure keeps reporting closed.
    FirebaseCrashlytics.getInstance().checkForUnsentReports().addOnCompleteListener { task ->
      synchronized(this) {
        reports = if (task.isSuccessful) task.result else null
        val callbacks = pending.toList()
        pending.clear()
        callbacks.forEach { it() }
      }
    }
  }

  @Synchronized fun record(message: String) {
    if (currentScope == null || mixed) return
    FirebaseCrashlytics.getInstance().recordException(CrashConsentDiagnostic(message.take(200)))
  }
  @Synchronized fun log(message: String) {
    if (currentScope == null || mixed) return
    FirebaseCrashlytics.getInstance().log(message.take(120))
  }
}

private class CrashConsentDiagnostic(message: String) : Exception(message)
