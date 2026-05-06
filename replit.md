# AI Terminal Assistant

A full-stack AI-powered terminal assistant with a CLI-style dark interface where users type natural language commands and get AI-generated shell commands with explanations, safety checks, and execution control.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/terminal-assistant run dev` — run the frontend (port 23459)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `SESSION_SECRET` — Express session secret

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, TailwindCSS, TanStack Query
- API: Express 5 + express-session
- DB: PostgreSQL + Drizzle ORM (command_history table)
- AI: OpenAI SDK (gpt-4o-mini) — user supplies their own API key per session
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth)
- `lib/api-client-react/src/generated/` — Generated React Query hooks
- `lib/api-zod/src/generated/` — Generated Zod schemas
- `lib/db/src/schema/commandHistory.ts` — DB schema
- `artifacts/api-server/src/routes/terminal.ts` — All terminal API routes
- `artifacts/api-server/src/lib/openai.ts` — OpenAI integration (chat, explain, fix-error)
- `artifacts/api-server/src/lib/safety.ts` — Dangerous command detection
- `artifacts/api-server/src/lib/systemChecks.ts` — System checks (node, git, python, etc.)
- `artifacts/api-server/src/data/requirements.json` — Task requirement definitions (extensible)
- `artifacts/terminal-assistant/src/` — Frontend terminal UI

## Architecture decisions

- OpenAI API key stored server-side in express-session (never exposed to client after submission)
- Command execution uses `child_process.exec` with 30s timeout and output sanitization (strips API keys/tokens from output)
- Dangerous command detection via regex patterns runs on both AI suggestion and before execution
- Requirements engine uses a JSON file (`requirements.json`) so new task workflows can be added without code changes
- `lib/api-zod/src/index.ts` only re-exports from `./generated/api` (not types) to avoid duplicate export conflicts with Orval split mode

## Product

- API key entry modal (session-based, validated against OpenAI before storing)
- Natural language → shell command generation via GPT-4o-mini
- Command explanation with flag breakdown (brief/detailed/beginner modes)
- Safety layer: detects `rm -rf`, `sudo`, fork bombs, pipe-to-shell, and more
- Dry run mode: previews commands without executing
- Explicit confirmation required before any execution
- Error recovery: AI suggests fixes for failed commands
- System checks: node, git, python, docker, etc.
- Project context detection: reads package.json, requirements.txt, .git
- Command history stored in PostgreSQL, browsable from sidebar
- Requirements engine: JSON-defined task workflows, extensible via API

## Gotchas

- After any OpenAPI spec change, run codegen AND manually remove the `export * from "./generated/types"` line from `lib/api-zod/src/index.ts` (Orval regenerates it with duplicate exports)
- The codegen script (`pnpm --filter @workspace/api-spec run codegen`) fails if `lib/api-zod/src/index.ts` has both barrel exports — run `orval` alone, fix index.ts, then `typecheck:libs`
- Command execution runs in the server process's working directory (the project root), not the user's machine

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
