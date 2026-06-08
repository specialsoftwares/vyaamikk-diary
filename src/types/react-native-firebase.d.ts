/**
 * Ambient types for @react-native-firebase/* — installed via EAS/dev build only.
 * Keeps typecheck passing before `npm install` completes.
 */
declare module "@react-native-firebase/auth" {
  export interface ConfirmationResult {
    confirm(verificationCode: string): Promise<UserCredential>;
  }
  export interface UserCredential {
    user: { uid: string };
  }
  export interface FirebaseAuthInstance {
    signInWithPhoneNumber(phoneNumber: string): Promise<ConfirmationResult>;
    signOut(): Promise<void>;
    currentUser: { uid: string } | null;
  }
  export default function auth(): FirebaseAuthInstance;
}

declare module "@react-native-firebase/functions" {
  export interface HttpsCallableResult<T = unknown> {
    data: T;
  }
  export interface HttpsCallable<TRequest = unknown, TResponse = unknown> {
    (data?: TRequest): Promise<HttpsCallableResult<TResponse>>;
  }
  export interface FunctionsInstance {
    httpsCallable<TRequest = unknown, TResponse = unknown>(
      name: string
    ): HttpsCallable<TRequest, TResponse>;
  }
  export default function functions(): FunctionsInstance;
}
