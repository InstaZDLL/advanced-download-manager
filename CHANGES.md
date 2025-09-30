# Changelog

All notable changes to the Advanced Download Manager (ADM) project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.5] - 2025-09-30

## [1.0.6] - 2025-09-30

### Fixed

- Smooth, accurate download progress for aria2/yt-dlp/ffmpeg
  - Use real `jobId` instead of aria2 `gid` or random IDs
  - Persist periodic updates (progress/speed/ETA/size) to DB

### Added

- Live WebSocket relaying from worker to clients
  - Backend subscribes to worker `progress/completed/failed` events
  - Broadcasts to `job:{jobId}` rooms for real-time UI updates
  - Keeps DB in sync while pushing events live

### Added

- **Retry Functionality**: Complete implementation of job retry feature
  - New endpoint `POST /downloads/:jobId/retry` for retrying failed or cancelled jobs
  - Frontend "Retry" button with React Query mutation for failed downloads
  - Backend service method that resets job status and re-adds to queue
  - Automatic restoration of original job parameters (headers, transcode settings)
- **Production Start Script**: Added `npm start` command to run backend + worker in production mode
- **aria2 Configuration**: Added environment variables for aria2 RPC connection
  - `ARIA2_RPC_URL` for specifying aria2 JSON-RPC endpoint
  - `ARIA2_SECRET` for secure RPC authentication

### Fixed

- **API Endpoints**: Removed temporary mock responses that were blocking real functionality
  - Fixed `POST /downloads` to actually create downloads instead of returning test data
  - Fixed `GET /downloads` to retrieve real jobs from database instead of empty array
  - Resolved dependency injection issues with `DownloadsService`
- **Development Server**: Replaced `tsx` with `nodemon` for proper TypeScript decorator support
  - Fixed `emitDecoratorMetadata` support required for NestJS dependency injection
  - Added `nodemon.json` configuration for automatic recompilation on file changes
  - Resolved "Cannot read properties of undefined" errors in controllers
- **API Client**: Fixed Fastify "Body cannot be empty" error for POST requests without body
  - Modified `apiRequest` to only set `Content-Type: application/json` when body is present
  - Resolved 400 errors on retry, cancel, pause, and resume endpoints
- **Worker Paths**: Fixed aria2 download failures due to relative path resolution
  - Converted all directory paths to absolute using `path.resolve()`
  - aria2 daemon now correctly resolves download output directories
  - Fixed "aria2 RPC error: 400 Bad Request" caused by invalid relative paths
- **WebSocket Gateway**: Fixed "Cannot read properties of undefined (reading 'join')" error
  - Added missing `@ConnectedSocket()` decorator for Socket parameter injection
  - Clients can now properly join/leave job rooms for real-time progress updates

### Security

- **aria2 Secret**: Generated cryptographically secure random secret (Base64, 32 bytes)
  - Replaced default "dev-secret" with `5eYu4XrI4E4c/IgcnK1qeGSNxfxB3cTaZTLkNl6C2+0=`
  - Updated both backend `.env` and package.json startup script

### Changed

- **Backend Development**: Modified development workflow to use nodemon for better compatibility
  - `npm run dev` now compiles TypeScript properly before running
  - Worker process also uses nodemon for consistent behavior
  - Real-time recompilation on source file changes

### Changed

- **Frontend UX**: Amélioration de la réactivité de l'interface utilisateur
  - Feedback immédiat lors de l'ajout d'un téléchargement avec message de succès
  - Auto-join des WebSocket rooms pour les jobs actifs
  - Polling réduit de 5s à 2s pour meilleure réactivité
  - Invalidation immédiate de la query `downloads` après création de job

### Documentation

- Updated environment variable documentation for aria2 configuration
- Added retry endpoint to API documentation

## [1.0.4] - 2025-09-29

### Code Quality & Type Safety Improvements

- **ESLint Configuration**: Migrated to flat config format with proper TypeScript support
- **Frontend Linting**: Added jsx-a11y and import-x plugins for better code quality
- **TypeScript Fixes**: Resolved all strict type checking errors across the codebase
- **Error Handling**: Proper typing of unknown errors with instanceof checks
- **Type Imports**: Consistent use of `import type` for TypeScript imports

### Frontend Development

- **React 19 Compatibility**: Fixed React import issues and component types
- **ESLint Rules**: Configured rules for React hooks, accessibility, and imports
- **Console Statements**: Replaced debug logs with appropriate warning levels
- **Type Definitions**: Added @types/node for complete Node.js type support

### Backend Type Safety

- **Queue Service**: Fixed BullMQ event listener types and job data interfaces
- **Logger Service**: Improved pino import compatibility with ESM modules
- **Database Schema**: Aligned TypeScript interfaces with actual data structures
- **Worker Process**: Proper error handling and type safety throughout

### Build System Improvements

- **TypeScript Compilation**: All projects now compile without errors
- **Monorepo Support**: Proper project references and incremental builds
- **Linting Pipeline**: Both frontend and backend pass ESLint checks
- **Development Experience**: Faster builds with better error reporting

### Bug Fixes

- **Header Interface**: Fixed type mismatch in download job headers structure
- **Validation Pipe**: Proper error typing in Zod validation pipeline
- **Event Listeners**: Corrected BullMQ queue event parameter types
- **Module Resolution**: Fixed pino logger ESM/CommonJS compatibility

### Documentation Updates

- Added `AGENTS.md` contributor guide covering project structure, development commands, coding style, testing, and PR guidelines.

## [1.0.3] - 2025-09-29

### TypeScript & Development Quality

- **Project References**: Monorepo TypeScript avec build incrémental (`composite: true`)
- **Real-time Type Checking**: vite-plugin-checker pour erreurs TS dans le navigateur
- **Type Safety Renforcée**: Configuration stricte avec `useUnknownInCatchVariables`
- **Build Mode**: `tsc -b` pour type-checking global optimisé
- **Development Scripts**: Type-checking en parallèle du développement

### Socket.IO & WebSocket Improvements

- **Adaptateur Socket.IO robuste**: Configuration production-ready avec NestJS + Fastify
- **CORS optimisé**: Support `127.0.0.1` + `localhost` avec méthodes explicites
- **Connection State Recovery**: Reprise automatique après micro-coupures (120s)
- **Transport configurables**: WebSocket + polling via variables d'environnement
- **Path explicite**: `/socket.io` configurable pour éviter les collisions

### Configuration & Environment

- **Structure .env simplifiée**: Un seul .env par service (backend/frontend)
- **Variables Socket.IO**: `SOCKET_IO_PATH`, `SIO_TRANSPORTS` configurables
- **External Tools optionnels**: aria2, yt-dlp, ffmpeg commentés (plus de Docker)
- **Database SQLite**: Migration PostgreSQL → SQLite avec chemin correct

### Bug Fixes & Corrections

- **Import TypeScript**: `import type` pour `verbatimModuleSyntax: true`
- **Logger NestJS**: `logger.log()` au lieu de `logger.info()`
- **WebSocket Gateway**: Configuration centralisée dans l'adaptateur
- **API temporaire**: Réponses de test pour éviter erreurs 500

## [1.0.2] - 2025-01-29

### Major Changes

- **Development Experience**: Complete overhaul of development setup
- **One-command startup**: `npm run dev` now handles everything automatically
- **Docker removed**: Switched to local development for easier testing and iteration

### Developer Experience Improvements

- **Smart startup script**: Automatic service detection and startup
- **Colored logs**: Each service (backend, worker, frontend) has distinct colors
- **Prerequisites checking**: Automatic detection of required tools
- **Parallel execution**: All services start simultaneously with proper coordination
- **Graceful shutdown**: Ctrl+C cleanly stops all processes

### Frontend Configuration

- **Vite config enhanced**: Added path aliases (@/), optimized build settings
- **TypeScript improved**: Better path mapping and modern configuration
- **Tailwind CSS upgraded**: Dark mode support, extended color palette, responsive containers
- **Development server**: Host 0.0.0.0 for network access, strict ports

### Backend Configuration

- **TypeScript modernized**: NodeNext module resolution for better Node.js compatibility
- **NestJS optimized**: Proper decorator support and incremental compilation
- **Build performance**: Incremental builds with cache support
- **ES Modules**: Full modern Node.js module support

### New Scripts and Tools

- `npm run dev` - One-command startup (recommended)
- `npm run install:all` - Install all dependencies across projects
- `npm run check:services` - Service status verification
- `npm run stop:services` - Clean service shutdown
- `start.js` - Intelligent startup orchestrator with colored output
- `QUICKSTART.md` - Quick reference guide

### Documentation Updates

- **README.md**: Simplified with focus on quick start
- **QUICKSTART.md**: New dedicated quick reference
- **Development workflow**: Clear instructions for different scenarios

### Removed

- **All Docker files**: Containers, compose files, dockerignore
- **Docker documentation**: Focused on local development
- **Complex setup**: Replaced with automated scripts

## [1.0.1] - 2025-01-29

### Changed

- **Docker Architecture**: Replaced aria2pro with custom aria2 standard container
- **Container builds**: All services now use custom-built images instead of external images
- **aria2 Configuration**: Custom aria2.conf with optimized settings for download management
- **Security**: aria2 runs with non-root user and proper file permissions

### Added

- Custom aria2 Dockerfile with Alpine Linux base
- aria2 configuration file with RPC settings
- aria2 entrypoint script with environment variable support
- aria2 documentation and troubleshooting guide

### Technical Details

- aria2 container based on Alpine 3.19 with standard aria2 package
- Configurable via environment variables (RPC_SECRET, DOWNLOAD_DIR, MAX_CONCURRENT_DOWNLOADS)
- Proper health checks for aria2 RPC interface
- Persistent configuration and session storage
- Secure RPC access with token authentication

## [1.0.0] - 2025-01-29

### Added

#### Core Features

- **Multi-type download support**: YouTube videos, HLS streams (M3U8), direct file downloads
- **Real-time progress tracking**: WebSocket-based live updates with progress bars, speed, and ETA
- **Queue management**: Concurrent download limiting (max 3 jobs) with priority queuing
- **Video transcoding**: FFmpeg integration for format conversion (MP4, WebM, AVI)
- **File management**: Automatic cleanup with configurable retention policies

#### Backend Architecture

- **NestJS framework** with Fastify adapter for high performance
- **BullMQ + Redis** for robust job queue management
- **Prisma ORM** with SQLite database for job tracking and metrics
- **Socket.IO** for WebSocket real-time communication
- **External tool integration**: yt-dlp, aria2, ffmpeg

#### Frontend

- **React 19** with TypeScript for modern UI
- **Tailwind CSS** for responsive design
- **TanStack Query** for efficient data fetching and caching
- **Socket.IO Client** for real-time updates
- **Job management interface** with filtering, search, and pagination

#### Security Features

- **API key authentication** (optional, read-only mode without key)
- **Rate limiting** (200 requests per 15 minutes per IP)
- **CORS protection** with origin whitelist
- **Input sanitization** and filename validation
- **Secure file serving** with proper headers
- **Header validation** for custom download headers

#### Development & Deployment

- **Docker containerization** with multi-stage builds
- **Docker Compose** orchestration for all services
- **Development environment** with hot reload
- **Production-ready** configuration with Nginx reverse proxy
- **Health monitoring** with comprehensive status checks
- **Automated setup script** for easy deployment

#### API Endpoints

- `POST /downloads` - Create new download job
- `GET /downloads` - List downloads with filtering and pagination
- `GET /downloads/:id` - Get specific download details
- `POST /downloads/:id/cancel|pause|resume` - Job control actions
- `GET /files/:id` - File metadata
- `GET /files/:id/download` - Download completed files
- `GET /health` - System health status

#### WebSocket Events

- `progress` - Real-time download progress updates
- `completed` - Download completion notifications
- `failed` - Error notifications with detailed messages
- `job-update` - General job status changes

#### Configuration Options

- **Concurrency limits** - Max 3 simultaneous downloads
- **File quotas** - Size limits and retention policies
- **External tool paths** - Configurable binary locations
- **Security settings** - API keys, CORS origins, rate limits
- **Storage configuration** - Data and temporary directories

### Technical Specifications

#### Database Schema

- **Job table**: Download records with status, progress, metadata
- **Metrics table**: Daily usage statistics and analytics

#### Worker Architecture

- **Separate worker process** for download execution
- **Job progress monitoring** with timeout handling
- **Error recovery** with configurable retry logic
- **Resource management** with CPU/IO throttling

#### Monitoring & Logging

- **Structured logging** with pino logger
- **Health checks** for all services and external dependencies
- **Error tracking** with detailed error codes and context
- **Performance metrics** collection

### Infrastructure

- **Redis** for job queue and caching
- **aria2** daemon for efficient file downloads
- **SQLite** database with WAL mode for better concurrency
- **Nginx** reverse proxy with static file serving

### Development Tools

- **TypeScript** throughout the stack
- **ESLint** with strict configuration
- **Prettier** for code formatting
- **Hot module replacement** for development
- **Docker development environment**

### Documentation

- Comprehensive README with setup instructions
- API documentation with examples
- WebSocket event specifications
- Security configuration guide
- Troubleshooting guide
- Docker deployment instructions

---

## Future Roadmap

### Planned Features

- [ ] User authentication and multi-tenancy
- [ ] Download scheduling and recurring downloads
- [ ] Browser extension integration
- [ ] Mobile app companion
- [ ] Advanced analytics dashboard
- [ ] Plugin system for custom downloaders
- [ ] Batch operations and bulk management
- [ ] Integration with cloud storage services
- [ ] Advanced filtering and tagging system
- [ ] Download history export/import

### Performance Improvements

- [ ] Distributed worker support
- [ ] Advanced caching strategies
- [ ] Database optimization for large datasets
- [ ] Streaming file processing
- [ ] Bandwidth throttling per job

### Security Enhancements

- [ ] OAuth2 integration
- [ ] Role-based access control
- [ ] Audit logging
- [ ] Content scanning and validation
- [ ] Network isolation options
