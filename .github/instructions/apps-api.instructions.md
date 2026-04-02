# API Application Instructions

**applyTo**: `apps/api/**`

## Stack

- **Fastify** backend on port 3000
- Imports shared libs via `@mtg/*` path aliases
- Serve: `pnpm nx serve api`

## Testing

- Unit tests: `*.spec.ts` colocated with source
- Integration tests: `*.integration.spec.ts` — test full request/response cycles
- **Always mock external APIs** in tests — use Vitest `vi.mock()` or manual stubs
- Run: `pnpm nx test api`

## Patterns

- Register routes via Fastify plugins (`fastify.register()`)
- Validate request/response schemas with Fastify's built-in JSON Schema support
- Keep route handlers thin — delegate logic to library functions in `libs/`
