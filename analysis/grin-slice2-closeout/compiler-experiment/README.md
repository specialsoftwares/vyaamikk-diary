# Compiler experiment — Functions rootDir / entry-point shift

## Executor distinction

- **Cursor ran this experiment** in a prior closeout on this worktree. Emitted
  files below are those artifacts.
- **Independent reviewer reproduction is not claimed.** Re-run the commands
  below on a clean copy of `compiler-experiment/` to reproduce.

Pinned compiler: `functions/node_modules/typescript/bin/tsc` **Version 5.9.3**
Real `functions/tsconfig.json` copied unchanged (`include: ["src"]`, `outDir: "lib"`, no `rootDir`).
Real `functions/package.json` / application source were not modified.

## Minimal inputs

Control: `functions-control/src/index.ts` only.

Outside-import: 
- `functions/src/index.ts`
- `functions/src/goodsEvidence/adapter.ts` (relative import of
  `../../../src/goodsEvidence/canonical`)
- `compiler-experiment/src/goodsEvidence/canonical.ts`
- `compiler-experiment/src/goodsEvidence/constants.ts`

## Exact command

```
cd analysis/grin-slice2-closeout/compiler-experiment/functions-control
../../../../functions/node_modules/typescript/bin/tsc --listEmittedFiles

cd ../functions
../../../functions/node_modules/typescript/bin/tsc --listEmittedFiles
```

## Emitted files (Cursor run)

Control:

- `functions-control/lib/index.js`  ← matches `main: lib/index.js`

Outside-import (`rootDir` lifted to `compiler-experiment/`):

- `functions/lib/functions/src/index.js`  ← **not** `lib/index.js`
- `functions/lib/functions/src/goodsEvidence/adapter.js`
- `functions/lib/src/goodsEvidence/canonical.js`
- `functions/lib/src/goodsEvidence/constants.js`

Leaving a handler unexported does not exclude it: `include: ["src"]` still
compiles `adapter.ts`, and the relative import still pulls repo-level files.

**Conclusion:** Keep the future adapter under `tools/goods-evidence-emulator/**`.
Do not add relative imports of `src/goodsEvidence` into production `functions/src`.
