# Plan d’architecture et migration (serveur seul writer + PostgreSQL)

## 1) Objectif

- **Serveur seul writer**: l’API NestJS est l’unique source d’écriture en DB (progress/status). Le worker n’écrit jamais en DB; il n’émet que des events.
- **PostgreSQL**: base relationnelle principale. **Redis** en appui (Queue BullMQ, éventuellement adapter Socket.IO, cache léger/PubSub).

## 2) Architecture

- **Frontend**: React 19 + Vite + Tailwind. REST pour créer/piloter. WebSocket pour le live.
- **API**: NestJS + Fastify + Socket.IO.
- **Queue**: BullMQ (Redis), concurrence globale 3 jobs.
- **Worker**: process Node (yt-dlp, aria2, ffmpeg). Émet `progress/completed/failed` via WS (namespace `/worker`).
- **Stockage**:
  - Fichiers: `backend/data/{jobId}/...` (temp `backend/tmp/{jobId}` → move atomique en fin de job).
  - DB: **PostgreSQL** via Prisma. Le serveur persiste `progress/speed/eta/totalBytes` (throttle 2–4 Hz/job) et états terminaux.
- **Config**: `.env` par service (backend/frontend). Clés/API, chemins binaires, quotas, origins CORS, DB URL.

## 3) WebSocket & sécurité

- **Namespaces**: `/jobs` (clients UI) et `/worker` (worker authentifié).
- **Rooms**: `job:{jobId}` pour le push ciblé.
- **Auth worker**: token côté client worker (`auth.token`) + guard/middleware côté serveur.
- **Payloads**: valider `jobId`, types et bornes (`0 <= progress <= 100`). Ignorer events après `completed/failed`.
- **Adapter Redis** (prod multi-instances): Socket.IO adapter pour diffuser entre nœuds.

## 4) Contrats d’API

- REST
  - `POST /downloads` → `{ jobId }`
  - `GET /downloads/:jobId` → état courant (DB)
  - `POST /downloads/:jobId/(cancel|pause|resume|retry)`
  - `GET /files/:jobId` (métadonnées) | `GET /files/:jobId/download`
- WebSocket
  - `progress`: `{ jobId, stage, progress, speed?, eta?, totalBytes? }`
  - `completed`: `{ jobId, filename, size, outputPath }`
  - `failed`: `{ jobId, errorCode, message }`
  - `job-update`: `{ jobId, status?, stage?, progress? }`

## 5) Modèle de données (Prisma, simplifié)

- `jobs` (`id uuid`, `url`, `type`, `status queued|running|paused|failed|completed`, `stage`, `progress float`, `speed string?`, `eta int?`, `totalBytes bigint?`, `filename?`, `outputPath?`, `errorCode?`, `errorMessage?`, `meta text?`, `headers text?`, timestamps).
- `metrics` (optionnel, agrégés journaliers).

## 6) Plan d’exécution (migration)

1. Postgres opérationnel (docker compose) → OK.
2. Prisma → provider `postgresql` et `DATABASE_URL` dans `backend/.env`.
3. `npx prisma generate` puis `npx prisma migrate dev -n "init_postgres"` (dev) / `prisma migrate deploy` (prod).
4. Worker: émettre uniquement via WS (pas d’écriture DB).
5. Backend (namespace `/worker`): recevoir, throttle (2–4 Hz/job), `DownloadsService.updateJobProgress(...)`, re-diffuser vers `/jobs` room `job:{jobId}`.
6. Frontend: réduire le polling quand socket healthy, fallback si déconnexion.
7. Observabilité: métriques sockets, taux d’updates DB, logs erreurs; healthchecks Redis/aria2.

## 7) Observabilité & robustesse

- Logs structurés (pino) avec `jobId` et `stage`.
- Health: `GET /health` + Redis + aria2 RPC.
- Watchdog: si aucun progress > 60s, kill + retry (yt-dlp/hls).
- Sentry/équivalent pour exceptions en prod.

## 8) Déploiement & rollback

- Déploiement: `docker compose up -d postgres` → migrations Prisma → démarrer backend/worker.
- Scale: plusieurs instances API + adapter Redis Socket.IO.
- Rollback: conserver volume `postgres_data` + fichier SQLite historique. En cas d'incident, repointer `DATABASE_URL` vers SQLite temporairement (dev) ou restaurer snapshot Postgres.

## 9) Tests

- Unit: parseurs de progress (yt-dlp/ffmpeg) et validators payloads WS.
- E2E: création job → progress live → completion/échec → reconnexion sockets.
