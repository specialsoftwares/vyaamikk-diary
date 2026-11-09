import { useRef } from "react";

import { emptyOwned, nextOwnedSnapshot, type OwnedMemory } from "./resolveScreenState";

export function useOwnedSnapshot<T>(input: {
  signedInUid: string | null;
  loading: boolean;
  failed: boolean;
  value: T;
}): OwnedMemory<T> {
  const slot = useRef<OwnedMemory<T>>(emptyOwned<T>());
  slot.current = nextOwnedSnapshot(slot.current, input);
  return slot.current;
}
