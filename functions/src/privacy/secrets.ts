import { defineSecret } from "firebase-functions/params";

/** Server content key. Not the billing KMS key and not an EXPO_PUBLIC value. */
export const contentDataKey = defineSecret("CONTENT_DATA_KEY");

/**
 * CONTENT_DATA_KEYS is intentionally not bound with defineSecret yet.
 * Attaching it would require the named key ring to exist at deploy.
 * v2 writes stay off until that binding is authorised.
 */
