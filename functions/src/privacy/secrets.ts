import { defineSecret } from "firebase-functions/params";

/** Server content key. Not the billing KMS key and not an EXPO_PUBLIC value. */
export const contentDataKey = defineSecret("CONTENT_DATA_KEY");
