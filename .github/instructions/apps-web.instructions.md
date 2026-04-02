# Web Application Instructions

**applyTo**: `apps/web/**`

## Stack

- **React 18** with TypeScript, bundled by **Vite**
- Serve: `pnpm nx serve web`

## Testing

- Component tests: `*.spec.tsx` colocated with components
- Use Vitest + `@testing-library/react`
- **Stable DOM selectors**: Use `data-testid` attributes. Never rename them without updating all tests and Playwright E2E specs.
- E2E: `apps/web-e2e/` uses Playwright — run with `pnpm nx e2e web-e2e`

## Patterns

- Functional components with hooks only — no class components
- Keep components small and composable
- Import shared logic from `@mtg/*` libs, not from `apps/api/`
