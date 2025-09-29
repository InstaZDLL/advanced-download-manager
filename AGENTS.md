# Repository Guidelines

This repo hosts Advanced Download Manager (ADM), a TypeScript monorepo with a NestJS backend and a React 19 frontend.

## Project Structure & Module Organization

- `backend/`: NestJS API, workers, Prisma schema. Key paths: `src/modules`, `src/shared`, `src/workers`, `prisma/`, `dist/`.
- `frontend/`: React app with Vite and Tailwind. Key paths: `src/components`, `src/hooks`, `src/services`, `src/types`, `public/`, `dist/`.
- Root utilities: `start.js`, `scripts/`, `.env.example`, `docker/`, `docs/`, `legacy/`, `logs/`.
- Data dirs: `backend/data` (DB/files), `backend/tmp` (temp), `backend/downloads` (artifacts).

## Build, Test, and Development Commands

- `npm run install:all`: Install root + app dependencies.
- `npm run dev`: Start Redis/aria2, backend API + worker, and frontend.
- `npm run build`: Build backend then frontend.
- `npm run lint`: ESLint for backend and frontend.
- `npm run typecheck` | `:watch`: Cross-project type checks.
- Backend: `cd backend && npm run dev` | `worker` | `db:migrate` | `test`.
- Frontend: `cd frontend && npm run dev` | `build` | `lint` | `preview`.

## Coding Style & Naming Conventions

- Language: TypeScript everywhere; ESM modules.
- Indentation: 2 spaces; end-of-line semicolons; single quotes.
- Imports: prefer `import type { T }` for types.
- Names: `PascalCase` for classes/React components; `camelCase` for variables/functions; backend files follow Nest patterns (e.g., `*.module.ts`).
- Linting: Flat ESLint configs in `backend/eslint.config.js` and `frontend/eslint.config.js` (TS-aware, React Hooks, a11y, import rules).

## Testing Guidelines

- Backend: Jest (`cd backend && npm test`). Add tests near source (`src/**/__tests__` or `*.spec.ts`).
- Frontend: Unit testing not configured by default; prefer integration tests when added (Vitest/Jest). Keep critical logic in hooks/services for testability.
- Aim to cover job queue logic, validators, and API contracts.

## Commit & Pull Request Guidelines

- Commits: Use Conventional Commits (`feat:`, `fix:`, `chore:`). Write imperative, scoped messages.
- PRs: Include a clear summary, linked issues (`Closes #123`), steps to test, and screenshots/GIFs for UI changes. Ensure `npm run lint` and `npm run typecheck` pass.

## Security & Configuration Tips

- Never commit secrets. Copy `.env.example` to `backend/.env` and `frontend/.env` as needed.
- Configure CORS via `ALLOWED_ORIGINS`; secure write actions with `API_KEY`.
- Required tools for full functionality: Redis, aria2, ffmpeg, yt-dlp (see README).

