import { useRef } from "react";

import {
  emptyOwned,
  nextOwnedSnapshot,
  type OwnedMemory,
  type RequestClaim,
} from "./resolveScreenState";

export function useOwnedSnapshot<T>(input: {
  signedInUid: string | null;
  epoch?: number | null;
  generation?: number | null;
  loading: boolean;
  failed: boolean;
  value: T;
  valueClaim?: RequestClaim | null;
}): OwnedMemory<T> {
  const slot = useRef<OwnedMemory<T>>(emptyOwned<T>());
  slot.current = nextOwnedSnapshot(slot.current, input);
  return slot.current;
}
