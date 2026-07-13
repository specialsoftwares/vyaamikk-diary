import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getApps, initializeApp } from "firebase-admin/app";

/**
 * Bridge the native phone-auth session to the Firebase JS SDK.
 *
 * The app signs in with @react-native-firebase/auth (native), but Firestore
 * and Storage run on the firebase JS SDK, whose auth instance never receives
 * the native credential. Security rules require request.auth.uid == uid, so
 * without a bridge every direct client Firestore/Storage operation is denied
 * in production.
 *
 * This callable is invoked over the NATIVE functions SDK (so request.auth is
 * the native phone-auth token) and returns a custom token for the SAME uid.
 * The client then calls signInWithCustomToken on the JS SDK auth instance.
 *
 * Deployment note: the function's runtime service account needs the
 * "Service Account Token Creator" IAM role on itself for createCustomToken
 * to work with Application Default Credentials.
 */
export const mintClientAuthToken = onCall({ region: "asia-south1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in with phone OTP first.");
  }
  if (getApps().length === 0) {
    initializeApp();
  }
  try {
    const token = await getAuth().createCustomToken(uid);
    return { token };
  } catch (e) {
    const message = e instanceof Error ? e.message : "token mint failed";
    throw new HttpsError("internal", `Could not mint client auth token: ${message}`);
  }
});
