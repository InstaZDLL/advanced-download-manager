# Plan corrigé (prêt à exécuter)

## 1) Architecture

* **Front** : Vite + Tailwind (SPA). WebSocket pour le live, REST pour créer/piloter les tâches.
* **API** : Node/TS **NestJS + Fastify** (perfs) + **Socket.IO** (ou WS natif).
* **Queue** : **BullMQ (Redis)** pour limiter à **3 jobs concurrents** (globaux) et gérer retry/priorités.
* **Workers** : process séparé (Node) qui lance `yt-dlp`, `ffmpeg`, ou appelle **aria2 RPC**.
* **Stockage** :

  * Fichiers : répertoire `data/…` avec sous-dossiers par job (UUID).
  * DB : **SQLite** (simple) via **Prisma** pour l’historique, états, métriques.
* **Config** : `.env` (chemins binaires, quotas, API key, URL aria2, répertoire de sortie).

## 2) Sécurité (durcie)

* **API key** optionnelle via header `x-api-key` (Guard Nest). Si absente → lecture seule.
* **Rate limit** Fastify : `200 req / 15 min / IP`.
* **CORS** : whitelist explicite des origines (URL front).
* **Headers** : `helmet` (désactiver `crossOriginResourcePolicy` si tu sers des fichiers).
* **Sanitisation** :

  * Interdire `path` en entrée : **ne jamais** accepter un chemin fourni par l’utilisateur.
  * Utiliser `sanitize-filename` pour **noms de fichiers dérivés** (titres) et imposer une **arborescence contrôlée** basée sur `jobId`.
* **Téléchargements** :

  * Forcer **temp dir** (`tmp/jobId`) → déplacer en `data/jobId` en fin de job (atomic).
  * **Quota** (ex: max 2 Go/job, 20 Go global) + **TTL** de rétention (ex: 7 jours) + tâche cron de purge.
* **Headers personnalisés/UA/Referer** : valider via **Zod** (liste blanche des clés autorisées).

## 3) Gestion de la concurrence (exactement 3 en parallèle)

* **BullMQ** : `concurrency: 3` côté worker global (un seul worker process) **ou** `maxStalledCount: 0` + `limiter: { max: 3, duration: 1000 }`.
* Catégories de jobs :

  * `generic-download` (aria2)
  * `yt-dlp` (avec/ sans post-process)
  * `ffmpeg-transcode` (si nécessaire)
* **Priorités** : `yt-dlp` (5), `generic` (3). **Retries** : 2 (backoff expo 5s/30s).

## 4) Intégration outils (sans surprises)

* **aria2** : lancer en daemon avec RPC activée (`--enable-rpc --rpc-listen-all=false --rpc-secret=…`).

  * Côté API : client JSON-RPC (`aria2.addUri`, `aria2.getGlobalStat`, `aria2.tellStatus`).
* **yt-dlp** : via `execa` + parse `stderr` (progress) → émettre `progress` WS.

  * Flags utiles : `--concurrent-fragments 5`, `--no-part`, `--newline`, `--user-agent`, `--referer`, `--output tmp/jobId/%(title)s.%(ext)s`.
* **ffmpeg** : via `execa`, lecture périodique de `progress` (`-progress pipe:2 -nostats -loglevel error`), throttle CPU (nice/ionice si Linux).

## 5) API (contrat clair)

**REST**

* `POST /downloads`

  * body: `{ url: string, type: 'auto'|'m3u8'|'file'|'youtube', headers?: { ua?: string, referer?: string, extra?: Record<string,string> }, transcode?: { to?: 'mp4', codec?: 'h264', crf?: number }, filenameHint?: string }`
  * resp: `{ jobId: string }`
* `GET /downloads/:jobId` → état courant (synchro DB)
* `POST /downloads/:jobId/cancel`
* `POST /downloads/:jobId/pause` / `resume` (si aria2)
* `GET /files/:jobId` → métadonnées (taille, nom final)
* **Téléchargement fichier** : `GET /files/:jobId/download` (disposition=attachment)

**WebSocket (room = jobId)**

* `progress` : `{ jobId, stage: 'queue'|'download'|'merge'|'transcode'|'finalize', pct: number, speed?: string, eta?: number, size?: number }`
* `log` : `{ ts, level, message }`
* `completed` : `{ jobId, filename, size }`
* `failed` : `{ jobId, errorCode, message }`

## 6) Modèle de données (Prisma, simplifié)

* **Job**(id, url, type, createdAt, updatedAt, status: `queued|running|paused|failed|completed`, stage, pct, bytes, speed, eta, filename, outputPath, errorCode, errorMessage, meta json, headers json)
* **Metrics** (optionnel) : journal agrégé par jour.

## 7) Front (Vite + Tailwind)

* Store `jobs[]` (id, status, pct, speed, eta, stage).
* Sur `POST /downloads` → ouvrir WS `room:jobId`.
* Cartes : actions **Pause/Resume/Cancel/Retry** (afficher seulement si applicable).
* Filtres : `status`, `type`, `search` par URL.
* Affichage **ETA** human-friendly, badge **stage**, toast à `completed/failed`.

## 8) Observabilité & robustesse

* **Logs structurés** (pino) : jobId, stage, event, duration.
* **Healthchecks** : `GET /health` + check Redis + aria2 RPC.
* **Sentry** (ou équivalent) pour exceptions.
* **Watchdog** : si `yt-dlp` n’émet pas de progress > 60s → kill + retry.

## 9) Déploiement & runtime

* **Process manager** : pm2 / systemd (2 processus : API (web) + worker).
* **Redis** : local ou conteneur.
* **aria2c** : service dédié (systemd) avec dossier `tmp/` isolé.
* **Docker** (recommandé) :

  * Conteneur `api` (node:20-alpine)
  * Conteneur `worker` (node:20-alpine)
  * Conteneur `redis`
  * Conteneur `aria2` (ou inclus dans worker si simple)
  * Monte `data/` et `tmp/` comme volumes persistants.

## 10) Limites & quotas (clairs et enforce)

* **Global concurrent = 3** (queue).
* **Taille max entrée** : 2 Go/job (arrêt si `bytes > quota`).
* **Durée max job** : 2h (timeout worker).
* **Rétention fichiers** : 7 jours (cron purge).
* **Extensions autorisées** : liste blanche si `file` direct.

## 11) Tests (rapides mais utiles)

* **Unit** : parseurs de progress (yt-dlp/ffmpeg).
* **E2E** : un URL HLS public, un YouTube, un gros ZIP via aria2.
* **Résilience** : coupure réseau simulée, referer manquant, header invalide, disque plein.