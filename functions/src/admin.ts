import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function ensureApp() {
  if (getApps().length === 0) {
    initializeApp();
  }
}

export function getAdminDb() {
  ensureApp();
  return getFirestore();
}

export function getAdminAuth() {
  ensureApp();
  return getAuth();
}

export function getAdminBucket() {
  ensureApp();
  return getStorage().bucket();
}
