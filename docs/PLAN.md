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

## 10) Intégration Twitter/X Media Downloader (twmd)

### Binaire et capacités
- **Outil**: `twitter-media-downloader` (alias `twmd`), binaire standalone, API-less
- **Capacités**:
  - Téléchargement par tweet unique (`-t TWEET_ID`)
  - Téléchargement par utilisateur (`-u USERNAME`, `-n NBR` pour limite)
  - Filtres: images (`-i`), vidéos (`-v`), ou tout (`-a`)
  - Support retweets (`-r`), mode update (`-U`)
  - Format de nom personnalisé (`-f "{DATE} {USERNAME} {ID}"`)
  - Auth cookies (`-C`) pour tweets NSFW
  - Support proxy (`-p`)

### Architecture d'intégration

#### 1. Détection d'URL
- **Patterns à matcher**:
  - `https://twitter.com/*/status/*`
  - `https://x.com/*/status/*`
  - `https://twitter.com/*` (profil utilisateur)
  - `https://x.com/*` (profil utilisateur)
- **Extraction**: tweet ID depuis URL ou username pour profil

#### 2. Worker Backend
- **Fichier**: `backend/src/workers/twitter-downloader.ts`
- **Classe**: `TwitterDownloader` (pattern similaire à `YtDlpDownloader`, `Aria2Downloader`)
- **Méthode**: `download(options: TwitterOptions)`
- **Options**:
  ```typescript
  interface TwitterOptions {
    url: string;
    outputDir: string;
    jobId: string;
    tweetId?: string;
    username?: string;
    mediaType?: 'images' | 'videos' | 'all';
    includeRetweets?: boolean;
    maxTweets?: number;
  }
  ```

#### 3. Parsing de progression
- **Défi**: `twmd` a une sortie moins structurée que yt-dlp/aria2
- **Approche**:
  - Parser les lignes de sortie (stdout/stderr)
  - Détecter patterns: "Downloading...", "Downloaded X/Y", "Saved to..."
  - Émettre `progress` via WebSocket (estimations basées sur compteur fichiers)
  - Parser le résultat final pour lister les fichiers téléchargés

#### 4. Type de job
- **Nouveau type**: `'twitter'` (ajout dans `DownloadJobData.type`)
- **Détection automatique**: lors de la soumission, détecter domaine `twitter.com` ou `x.com`

#### 5. Modifications nécessaires

**Backend**:
- `src/workers/twitter-downloader.ts` (nouveau fichier)
- `src/worker.ts`: ajouter case `'twitter'` dans le switch
- `src/shared/queue.service.ts`: ajouter type `'twitter'` dans union type
- `src/shared/dto/download.dto.ts`: documenter le nouveau type

**Frontend**:
- Détection URL Twitter dans le formulaire de soumission
- Badge/icône spécifique pour jobs Twitter
- Options UI: nombre de tweets, inclure retweets, type média

#### 6. Configuration
- **Variables d'environnement**:
  - `TWMD_PATH` (chemin vers le binaire, défaut: `./twitter-media-downloader`)
  - `TWITTER_COOKIES_PATH` (optionnel, pour auth NSFW)
  - `TWITTER_PROXY` (optionnel)

### Plan d'implémentation
1. Créer `TwitterDownloader` avec parsing basique
2. Ajouter le case dans `worker.ts`
3. Tester avec un tweet simple
4. Améliorer le parsing de progression
5. Ajouter détection frontend + UI
6. Support options avancées (cookies, proxy, filtres)

## 11) Étapes optionnelles

- Tests d'intégration Gateway
  - Valider: throttle des écritures DB (`PROGRESS_THROTTLE_MS`), flush sur `completed/failed`, émission aux rooms `job:{jobId}`.
  - Mock `DownloadsService` et `server.to(room).emit(...)`.
- Script E2E (manuel)
  - Script Node qui crée un job (POST /downloads), rejoint la room Socket.IO, affiche `progress/completed/failed`.
  - Utile pour CI et vérification locale rapide.
- Monitoring
  - Métriques Socket.IO (connexions, events/s), fréquence d'updates DB, erreurs.
  - Healthchecks Redis/Postgres/aria2.
- CI
  - Jobs: `npm run lint`, `npm test`, build, éventuellement tests E2E (workflow conditionnel).
- Adapter Redis (multi-instances)
  - `SIO_USE_REDIS=true`, installer `@socket.io/redis-adapter` et `ioredis`, config `REDIS_*`.
  - Tester diffusion multi-nœuds.
- Sécurité & Secrets
  - Ne jamais committer `.env` (utiliser `.env.example`). Régénérer `WORKER_TOKEN` en prod.
- Frontend UX
  - Toasts déjà présents pour `completed/failed`. Ajuster désactivation polling quand socket healthy.
- Rollback
  - Snapshot Postgres. Réduction contrôlée: désactiver Redis adapter, revenir à une instance.
