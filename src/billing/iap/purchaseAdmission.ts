/**
 * UX admission for a signed-in Play purchase.
 *
 * The client does not know tester UIDs. Only an authenticated server payload
 * with purchaseAllowed === true produces a token that can open the purchase
 * sheet. Empty, missing, or non-boolean admission stays closed. Transport
 * failure is unavailable and also must not start a purchase. This is not
 * GRIN admission and it is not entitlement.
 */

const PLAY_PURCHASE_ADMISSION_BRAND: unique symbol = Symbol("playPurchaseAdmission");

export const PLAY_PURCHASE_ADMISSION_CALLABLE = "getPlayPurchaseAdmission";

export type PlayPurchaseAdmissionToken = {
  readonly purchaseAllowed: true;
  readonly [PLAY_PURCHASE_ADMISSION_BRAND]: true;
};

export type InterpretedPurchaseAdmission =
  | { status: "allowed"; token: PlayPurchaseAdmissionToken }
  | { status: "closed" };

export type PurchaseAdmissionRead = InterpretedPurchaseAdmission | { status: "unavailable" };

export function interpretPurchaseAdmission(data: unknown): InterpretedPurchaseAdmission {
  if (data == null || typeof data !== "object" || Array.isArray(data)) {
    return { status: "closed" };
  }
  if ((data as { purchaseAllowed?: unknown }).purchaseAllowed !== true) {
    return { status: "closed" };
  }
  return {
    status: "allowed",
    token: {
      purchaseAllowed: true,
      [PLAY_PURCHASE_ADMISSION_BRAND]: true,
    },
  };
}

/** A missing admission callable is closed, not a purchase. Other failures can be retried. */
export function purchaseAdmissionFromCallFailure(code: string): PurchaseAdmissionRead {
  if (
    code.includes("not-found") ||
    code.includes("not_found") ||
    code.includes("unimplemented")
  ) {
    return { status: "closed" };
  }
  return { status: "unavailable" };
}

export function isPlayPurchaseAdmissionToken(value: unknown): value is PlayPurchaseAdmissionToken {
  if (value == null || typeof value !== "object") return false;
  const token = value as Partial<PlayPurchaseAdmissionToken>;
  return token.purchaseAllowed === true && token[PLAY_PURCHASE_ADMISSION_BRAND] === true;
}
