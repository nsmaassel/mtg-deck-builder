# Library Development Instructions

**applyTo**: `libs/**`

## Constraints

- Libraries are **pure TypeScript** — no React, no framework dependencies
- Export through barrel files (`index.ts`) at package root
- Use `import type` for cross-lib references to prevent circular dependencies (especially `power-level` → `deck-builder`)
- Path aliases: `@mtg/collection`, `@mtg/scryfall`, `@mtg/edhrec`, `@mtg/deck-builder`, `@mtg/power-level`, `@mtg/ai-advisor`

## Testing

- Vitest for all unit tests — colocate as `*.spec.ts` next to source
- **Always mock external APIs** (Scryfall, EDHRec, Claude) — never make real HTTP calls in tests
- Run: `pnpm nx test <lib-name>` or `pnpm test` for all
- Type check: `pnpm typecheck`

## Adding a New Library

```bash
pnpm nx g @nx/js:library libs/<name> --bundler=swc --unitTestRunner=vitest
```

Then add a path alias in `tsconfig.base.json` → `compilerOptions.paths`.
