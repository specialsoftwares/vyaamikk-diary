import React from "react";
import { useLocalSearchParams } from "expo-router";

import { PartyLedgerDetail } from "@/components/partyLedger/PartyLedgerDetail";
import { Screen } from "@/components/ui";
import { useAuth } from "@/state/auth";

export default function PartyLedgerPartyRoute() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ partyId?: string | string[] }>();
  const partyId = readPartyId(params.partyId);

  return (
    <Screen padded dismissKeyboardOnTap={false}>
      <PartyLedgerDetail ownerUid={user?.uid ?? null} partyId={partyId} />
    </Screen>
  );
}

function readPartyId(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
