# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable

# Copy workspace manifest + lockfile first for dependency caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json nx.json ./

# Install all dependencies (dev deps needed to build)
RUN pnpm install --frozen-lockfile

# Copy source code (node_modules is excluded via .dockerignore)
COPY . .

# Build the API and web SPA into dist/
RUN pnpm nx run-many --target=build --all --parallel=4

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy built artifacts and runtime deps
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Install only production dependencies for the bundled runtime
RUN corepack enable && pnpm install --prod --frozen-lockfile

# Expose port (Render injects PORT)
EXPOSE 3000

# Start the API server (which also serves the web SPA)
CMD ["node", "dist/apps/api/main.cjs"]