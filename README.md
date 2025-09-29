# Advanced Download Manager (ADM) v1.0.4

A modern, full-featured download manager built with React 19, NestJS, and TypeScript. Supports YouTube downloads, HLS streams, direct file downloads, and transcoding with real-time progress updates.

## Features

- **Multiple Download Types**: YouTube videos, HLS streams (M3U8), direct file downloads
- **Real-time Progress**: WebSocket-based live updates with progress bars, speed, and ETA
- **Queue Management**: Concurrent download limiting (max 3 jobs) with priority queuing
- **Transcoding**: FFmpeg integration for video format conversion
- **Security**: API key authentication, rate limiting, CORS protection, input sanitization
- **Web Interface**: Modern React 19 frontend with Tailwind CSS
- **TypeScript Robuste**: Project references, type-checking en temps réel, ESLint type-aware
- **Development Ready**: Local development optimized (Docker removed for faster iteration)
- **Code Quality**: ESLint flat config with strict TypeScript rules and accessibility checks

## Architecture

### Backend

- **NestJS** with Fastify adapter for high performance
- **BullMQ** + Redis for job queue management
- **Prisma** + SQLite for database
- **Socket.IO** for WebSocket communication
- **External tools**: yt-dlp, aria2, ffmpeg

### Frontend

- **React 19** with TypeScript
- **Tailwind CSS** for styling
- **TanStack Query** for data fetching
- **Socket.IO Client** for real-time updates

### TypeScript & Development

- **Project References**: Monorepo TypeScript avec build incrémental
- **Type Safety**: Configuration stricte avec `composite: true`
- **Real-time Type Checking**: vite-plugin-checker + tsc watch mode
- **Development Experience**: Hot reload + type errors dans le navigateur
- **Code Quality**: ESLint flat config with strict rules, accessibility checks, and import validation
- **Error Handling**: Proper typing of unknown errors throughout the codebase

## Quick Start

> 📋 **TL;DR**: `npm run install:all && npm run dev` et c'est parti !

### Super Quick Start

```bash
# 1. Install all dependencies
npm run install:all

# 2. Start everything (services + servers)
npm run dev
```

**That's it!** 🎉 The app will be available at <http://localhost:5173>

### TypeScript Development

The project now includes robust TypeScript configuration with real-time type checking:

```bash
# Type-check all projects (recommended for CI)
npm run typecheck

# Type-check in watch mode during development
npm run typecheck:watch

# Frontend with real-time type errors in browser
cd frontend && npm run dev

# Backend with parallel type-checking
cd backend && npm run dev
```

**Features:**

- **Project References**: Monorepo TypeScript with incremental builds
- **Real-time Checking**: Type errors displayed in browser via vite-plugin-checker
- **Strict Configuration**: `useUnknownInCatchVariables`, `noUncheckedIndexedAccess`
- **Build Mode**: `tsc -b` for optimized cross-project type checking
- **ESLint Integration**: Flat config with TypeScript-aware rules and accessibility checks
- **Error Safety**: Proper typing of unknown errors with instanceof checks

### What `npm run dev` does automatically

- ✅ Checks prerequisites (Node.js, npm, Redis, aria2, etc.)
- 🚀 Starts Redis and aria2 daemons automatically
- 💻 Launches backend API, worker, and frontend in parallel
- 🎨 Shows colored logs for each service
- 📋 Displays access URLs

### Prerequisites

**Required:**

- Node.js 22+
- npm

**Optional (but recommended):**

- **Redis** (for job queue)
- **aria2** (for file downloads)
- **yt-dlp** (for YouTube downloads)
- **ffmpeg** (for video transcoding)

### Install External Tools

**Ubuntu/Debian:**

```bash
sudo apt-get install redis-server aria2 ffmpeg
pip install yt-dlp
```

**macOS:**

```bash
brew install redis aria2 ffmpeg
pip install yt-dlp
```

### Alternative Scripts

- `npm run dev` - **Smart start** (recommended)
- `npm run dev:manual` - Manual mode with concurrently
- `npm run check:services` - Check service status
- `npm run stop:services` - Stop external services
- `./scripts/setup.sh` - Interactive setup

### Manual Setup (if needed)

1. **Clone and setup**:

```bash
git clone <repository-url>
cd ADM
cp .env.example .env
```

2. **Install dependencies**:

```bash
npm run install:all
# Or manually:
# npm install && cd backend && npm install && cd ../frontend && npm install
```

3. **Start everything**:

```bash
npm run dev
```

### Access URLs

- **Frontend**: <http://localhost:5173>
- **Backend API**: <http://localhost:3000>
- **Health Check**: <http://localhost:3000/health>

### Stopping

Press `Ctrl+C` to stop all servers cleanly.

## Configuration

### Environment Variables

**Backend (.env)**:

```bash
# Database
DATABASE_URL="file:./data/adm.db"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Security
API_KEY=your-secure-api-key
ALLOWED_ORIGINS=http://localhost:5173

# External Tools
ARIA2_RPC_URL=http://localhost:6800/jsonrpc
ARIA2_SECRET=your-aria2-secret
YTDLP_PATH=yt-dlp
FFMPEG_PATH=ffmpeg

# Limits
MAX_CONCURRENT_JOBS=3
RETENTION_DAYS=7
```

**Frontend**:

```bash
VITE_API_URL=http://localhost:3000
```

## API Documentation

### Downloads

#### Create Download

```bash
POST /downloads
Content-Type: application/json

{
  "url": "https://example.com/video",
  "type": "auto|youtube|m3u8|file",
  "headers": {
    "ua": "Custom User Agent",
    "referer": "https://example.com"
  },
  "transcode": {
    "to": "mp4",
    "codec": "h264",
    "crf": 23
  },
  "filenameHint": "my-download"
}
```

#### List Downloads

```bash
GET /downloads?page=1&limit=20&status=running&type=youtube&search=query
```

#### Job Actions

```bash
POST /downloads/{jobId}/cancel
POST /downloads/{jobId}/pause
POST /downloads/{jobId}/resume
```

### Files

#### Download File

```bash
GET /files/{jobId}/download
```

#### File Metadata

```bash
GET /files/{jobId}
```

### WebSocket Events

Connect to `/socket.io/` and join job rooms:

```javascript
socket.emit("join-job", { jobId: "uuid" });

// Listen for events
socket.on("progress", (data) => {
  // { jobId, stage, progress, speed, eta, totalBytes }
});

socket.on("completed", (data) => {
  // { jobId, filename, size, outputPath }
});

socket.on("failed", (data) => {
  // { jobId, errorCode, message }
});
```

## Security Features

- **API Key Authentication**: Optional API key for write operations
- **Rate Limiting**: 200 requests per 15 minutes per IP
- **CORS Protection**: Whitelist allowed origins
- **Input Sanitization**: Filename sanitization and path validation
- **File Quotas**: Size limits and retention policies
- **Header Validation**: Whitelist allowed custom headers

## Development

### Project Structure

```txt
ADM/
├── backend/           # NestJS backend
│   ├── src/
│   │   ├── modules/   # Feature modules
│   │   ├── shared/    # Shared services
│   │   ├── workers/   # Download workers
│   │   └── main.ts    # Entry point
│   ├── prisma/        # Database schema
│   └── Dockerfile
├── frontend/          # React frontend
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── types/
│   └── Dockerfile
├── data/              # Download storage
├── tmp/               # Temporary files
└── docker-compose.yml
```

### Scripts

**Global (Monorepo)**:

- `npm run dev` - Start all services (recommended)
- `npm run typecheck` - Type-check all projects (tsc -b)
- `npm run typecheck:watch` - Type-check in watch mode
- `npm run install:all` - Install all dependencies
- `npm run build` - Build backend + frontend
- `npm run lint` - Lint backend + frontend (ESLint flat config)

**Backend**:

- `npm run dev` - Start API server + type-checker in parallel
- `npm run dev:simple` - Start API server only
- `npm run worker` - Start worker process
- `npm run typecheck` - Type-check backend only
- `npm run db:migrate` - Run database migrations

**Frontend**:

- `npm run dev` - Start Vite + real-time type checking
- `npm run build` - Build for production (tsc -b + vite build)
- `npm run typecheck` - Type-check frontend only
- `npm run lint` - Run ESLint (flat config with TypeScript and accessibility rules)

### Database

The application uses SQLite with Prisma ORM. Schema includes:

- **Job**: Download job records with status, progress, metadata
- **Metric**: Daily usage statistics

### Testing

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test
```

## Monitoring

### Health Checks

- **API**: `GET /health` - Returns system status
- **Database**: Connection and query tests
- **External Tools**: Availability checks for yt-dlp, ffmpeg, aria2

### Logs

- **Structured Logging**: JSON logs with pino
- **WebSocket Events**: Real-time job progress and logs
- **Error Tracking**: Detailed error codes and messages

## Troubleshooting

### Common Issues

1. **Download fails with "Video unavailable"**:

   - Check if URL is accessible
   - Update yt-dlp: `pip3 install --upgrade yt-dlp`

2. **WebSocket connection fails**:

   - Verify CORS configuration
   - Check if port 3000 is accessible

3. **aria2 RPC errors**:

   - Ensure aria2 daemon is running
   - Verify RPC_SECRET matches configuration

4. **Transcoding fails**:
   - Check if ffmpeg is installed
   - Verify input file format is supported

### Logs

View logs in development:

```bash
docker-compose logs -f adm-backend
docker-compose logs -f adm-worker
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
