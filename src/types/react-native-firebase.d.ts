/**
 * Ambient types for @react-native-firebase/* — installed via EAS/dev build only.
 * Keeps typecheck passing before `npm install` completes.
 */
declare module "@react-native-firebase/auth" {
  export interface ConfirmationResult {
    verificationId: string;
    confirm(verificationCode: string): Promise<UserCredential>;
  }
  export interface FirebaseUser {
    uid: string;
    phoneNumber?: string | null;
    getIdToken(forceRefresh?: boolean): Promise<string>;
    updatePhoneNumber(credential: AuthCredential): Promise<void>;
  }
  export interface UserCredential {
    user: FirebaseUser;
  }
  export interface AuthCredential {
    providerId: string;
    token: string;
    secret: string;
  }
  export class PhoneAuthProvider {
    static credential(verificationId: string, code: string): AuthCredential;
  }
  export interface PhoneAuthSnapshot {
    state: "sent" | "timeout" | "verified" | "error";
    verificationId: string;
    code: string | null;
    error: unknown | null;
  }
  export interface PhoneAuthListener {
    on(
      event: "state_changed",
      observer: (snapshot: PhoneAuthSnapshot) => void,
      errorCb?: (error: unknown) => void,
      successCb?: (snapshot: PhoneAuthSnapshot) => void
    ): PhoneAuthListener;
    then(
      onFulfilled?: ((a: PhoneAuthSnapshot) => unknown) | null,
      onRejected?: ((a: unknown) => unknown) | null
    ): Promise<unknown>;
    catch(onRejected: (a: unknown) => unknown): Promise<unknown>;
  }
  export const PhoneAuthState: {
    CODE_SENT: "sent";
    AUTO_VERIFY_TIMEOUT: "timeout";
    AUTO_VERIFIED: "verified";
    ERROR: "error";
  };
  export interface FirebaseAuthSettings {
    appVerificationDisabledForTesting?: boolean;
    forceRecaptchaFlowForTesting?: boolean;
  }
  export interface FirebaseAuthInstance {
    app?: { name?: string; options?: { projectId?: string } };
    settings: FirebaseAuthSettings;
    signInWithPhoneNumber(phoneNumber: string): Promise<ConfirmationResult>;
    signInWithCredential(credential: AuthCredential): Promise<UserCredential>;
    verifyPhoneNumber(
      phoneNumber: string,
      autoVerifyTimeoutOrForceResend?: number | boolean,
      forceResend?: boolean
    ): PhoneAuthListener;
    signOut(): Promise<void>;
    currentUser: FirebaseUser | null;
    onAuthStateChanged(listener: (user: FirebaseUser | null) => void): () => void;
  }
  export default function auth(): FirebaseAuthInstance;
  export function firebase(): unknown;
}

declare module "@react-native-firebase/app" {
  export interface FirebaseApp {
    name: string;
    options?: { projectId?: string };
  }
  export function getApp(name?: string): FirebaseApp;
  export default function app(): FirebaseApp;
}

declare module "@react-native-firebase/functions" {
  export interface HttpsCallableResult<T = unknown> {
    data: T;
  }
  export interface HttpsCallable<TRequest = unknown, TResponse = unknown> {
    (data?: TRequest): Promise<HttpsCallableResult<TResponse>>;
  }
  export interface FunctionsInstance {
    app?: { name?: string; options?: { projectId?: string } };
    httpsCallable<TRequest = unknown, TResponse = unknown>(
      name: string
    ): HttpsCallable<TRequest, TResponse>;
  }
  export function getFunctions(
    app?: { name?: string; options?: { projectId?: string } },
    regionOrCustomDomain?: string
  ): FunctionsInstance;
  /**
   * Namespaced API. Prefer getFunctions(getApp(), region).
   * Default region when omitted is us-central1.
   */
  export default function functions(
    appOrRegion?: unknown,
    region?: string
  ): FunctionsInstance;
}
