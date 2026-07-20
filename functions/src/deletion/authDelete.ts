/**
 * Firebase Auth user deletion — idempotent when already absent.
 */

export type AuthLike = {
  deleteUser: (uid: string) => Promise<void>;
  getUser?: (uid: string) => Promise<unknown>;
};

export type AuthDeleteResult = "deleted" | "already_absent";

export async function deleteAuthUserIdempotent(
  auth: AuthLike,
  uid: string
): Promise<AuthDeleteResult> {
  try {
    await auth.deleteUser(uid);
    return "deleted";
  } catch (e) {
    const err = e as { code?: string; message?: string };
    const code = String(err.code ?? "");
    const msg = String(err.message ?? e);
    if (
      code === "auth/user-not-found" ||
      /user-not-found|there is no user|not found/i.test(msg)
    ) {
      return "already_absent";
    }
    throw e;
  }
}
