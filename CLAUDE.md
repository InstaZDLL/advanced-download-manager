# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Advanced Download Manager (ADM) built with React 19, TypeScript, and Vite. The project is currently in early development with a basic React + Vite template structure.

## Development Commands

- `npm run dev` - Start the development server with hot reload
- `npm run build` - Build the project (runs TypeScript compilation and Vite build)
- `npm run lint` - Run ESLint to check code quality
- `npm run preview` - Preview the production build locally

## Architecture

### Core Technology Stack
- **React 19** with TypeScript
- **Vite** for build tooling and development server
- **ESLint** with TypeScript and React configurations
- Modern ES modules (type: "module" in package.json)

### Project Structure
```
src/
├── main.tsx          # Application entry point
├── App.tsx           # Main application component
├── App.css           # Application styles
├── index.css         # Global styles
└── assets/           # Static assets (SVGs, images)

public/               # Public static files
├── vite.svg          # Vite logo

Configuration files:
├── vite.config.ts    # Vite configuration
├── tsconfig.json     # TypeScript project references
├── tsconfig.app.json # App-specific TypeScript config
├── tsconfig.node.json # Node.js TypeScript config
└── eslint.config.js  # ESLint configuration
```

### TypeScript Configuration
- Uses project references with separate configs for app and Node.js code
- Strict TypeScript configuration for type safety
- Modern ECMAScript target (ES2020)

### ESLint Configuration
- Configured for TypeScript and React
- Includes React Hooks and React Refresh plugins
- Uses modern ESLint flat config format
- Ignores `dist` directory from linting

## Development Notes

The project is currently a standard Vite + React template. When implementing the download manager functionality:

1. The app uses React 19 with modern patterns (no legacy mode)
2. Hot Module Replacement (HMR) is configured via Vite
3. Build output goes to `dist/` directory
4. All source code should follow the existing ESLint configuration
5. Components should be written in TypeScript with proper typing

## MCP Tools

In this project, Claude is connected to several **MCP (Model Context Protocol)** servers. These tools extend Claude’s abilities beyond simple text generation.

### Context7

**Purpose**: to inject up-to-date documentation and code examples into the prompt context.  
**Usage**: by prefixing a prompt with `use context7`, Claude can fetch the latest official docs for libraries/frameworks, reducing API hallucinations or outdated references.

### Brave Search

**Purpose**: to give Claude real-time web search capability via the Brave Search API.  
**Usage**: when a prompt requires looking up live information (web pages, news, images), Claude can call the Brave Search server to get fresh results and summaries.

### Git

**Purpose**: allow Claude to interact with a Git repository (e.g. read history, fetch files, compare versions).  
**Usage**: with a Git MCP server, Claude can suggest commits, patches, merges, or read code context from your repo.

### Time

**Purpose**: provide Claude with a notion of real time (dates, clock, time zones).  
**Usage**: using a Time or Clock MCP server, Claude can answer questions such as “What time is it now in Tokyo?”, “What day will it be in 72 hours?”, etc.
