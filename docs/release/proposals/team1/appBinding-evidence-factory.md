# Team 1 proposal: wire `createFirebaseJsGrinEvidenceTransport` in appBinding

Settled on combined after Team 4: `persistGrinOwnerSession` constructs

```
new GrinOutbox({ db, server: serverPortFactory(), evidence: evidencePortFactory() })
```

with default `createFirebaseJsGrinEvidenceTransport`. Tests inject FAKE via `setGrinEvidencePortFactoryForTests`. Production Functions export remains HOLD. Isolated emulator entry is `tools/goods-evidence-emulator/functions-entry/**`.

Contract E1 (`2026-10-02.wave2evidence`): `persistGrinOwnerSession` must construct

```
new GrinOutbox({ db, server: serverPortFactory(), evidence: evidencePortFactory() })
```

- Default `serverPortFactory` remains `createFirebaseJsGrinTransport`.
- Default `evidencePortFactory` is `createFirebaseJsGrinEvidenceTransport` from
  `@/services/grin/transport` (implemented on `team/grin-t1-backend`).
- Tests inject FAKE / uninjected / null via `setGrinEvidencePortFactoryForTests`
  (same pattern as `setGrinServerPortFactoryForTests`).
- `evidence: undefined` is not a production default. A missing **backend**
  (unexported callable, unauthenticated, network) must yield retryable
  `originalDurable: false`, never success. Team 1 transport already fail-closes
  that case; Team 4 must still pass the factory so the outbox calls `upload`
  instead of returning `attachment_pending` because `evidence` is missing.
- Do not import Admin SDK, Node `fs`, HostSqlite, or `tools/goods-evidence-*`.
- Do not export GRIN from `functions/src/index.ts`. Isolated Functions-emulator
  entry is `tools/goods-evidence-emulator/functions-entry/**`.

Suggested factory (Team 4):

```ts
import {
  createFirebaseJsGrinEvidenceTransport,
  createFirebaseJsGrinTransport,
} from "@/services/grin/transport";
import type { GrinEvidenceUploadPort } from "@/services/grin/outbox/ports";

let evidencePortFactory: () => GrinEvidenceUploadPort | null =
  defaultGrinEvidencePortFactory;

function defaultGrinEvidencePortFactory(): GrinEvidenceUploadPort {
  return createFirebaseJsGrinEvidenceTransport();
}

export function setGrinEvidencePortFactoryForTests(
  factory: (() => GrinEvidenceUploadPort | null) | null
): void {
  evidencePortFactory = factory ?? defaultGrinEvidencePortFactory;
}

// inside persistGrinOwnerSession:
const outbox = new GrinOutbox({
  db,
  server: serverPortFactory(),
  evidence: evidencePortFactory() ?? undefined,
});
```

Pass `null` from tests that need the missing-port `attachment_pending` path.
Production must not default to `undefined`.

Do not enable `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED`. Purchase-entry flags stay `"0"`.
Version remains `1.0.0` / `versionCode` 23.
