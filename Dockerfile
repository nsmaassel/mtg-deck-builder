# Dependencies: shared by the build and data stages
FROM node:20-alpine AS deps

WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable

# Copy workspace manifest + lockfile first for dependency caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json nx.json ./

# Install all dependencies (dev deps needed to build)
RUN pnpm install --frozen-lockfile

# Build stage
FROM deps AS builder

# Copy source code (node_modules is excluded via .dockerignore)
COPY . .

# Build the API and web SPA into dist/
RUN pnpm nx run-many --target=build --all --parallel=4

# Data stage: the files the deck advisor reads at start-up.
# It copies only what the data scripts import, so a change to the app does not
# download Scryfall's bulk files again.
FROM deps AS data

RUN apk add --no-cache git

COPY libs/card-index libs/card-index
COPY libs/meta-decks libs/meta-decks
COPY libs/combos libs/combos
COPY scripts/data scripts/data

# The data is a snapshot. Pass a new value to refresh it, for example
# --build-arg DATA_DATE=$(date +%F); Scryfall asks for at most one fetch a day.
ARG DATA_DATE=unset
RUN echo "data snapshot: ${DATA_DATE}"

# The card index is required: the advisor is the app's front page, and an image
# without it would deploy with that page out of order. A failure stops the build.
RUN pnpm data:cards
# Meta snapshots come from community repositories and are optional: without
# them the advisor still checks pasted decklists.
RUN pnpm data:meta || echo "WARNING: meta snapshots not built; the advisor will run without meta decks"
# Combos come from Commander Spellbook's bulk file and are optional too.
RUN pnpm data:combos || echo "WARNING: combos not built; the advisor will run without them"

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy built artifacts and runtime deps
COPY --from=builder /app/dist ./dist
COPY --from=data /app/data/generated ./data/generated
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Install only production dependencies for the bundled runtime
RUN corepack enable && pnpm install --prod --frozen-lockfile

# Expose port (Render injects PORT)
EXPOSE 3000

# Start the API server (which also serves the web SPA)
CMD ["node", "dist/apps/api/main.cjs"]
