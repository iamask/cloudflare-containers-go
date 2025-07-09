# Cloudflare Containers Demo: Go Backend + TypeScript Worker

## Overview

This project demonstrates how to use Cloudflare Containers to run a Go backend, with a Cloudflare Worker (TypeScript) acting as a gateway and a static frontend. It is designed for clarity and as a demo for Cloudflare Containers.

---

## How Routing Works (`src/index.ts`)

- **Entrypoint:** `src/index.ts` (TypeScript)
- **Routing logic:**
  - Requests to `/api/*` are proxied to backend containers (Go services) using Cloudflare's container orchestration.
  - All other requests (e.g., `/`) return static assets (the frontend HTML/JS in `dist/`).
- **Load Balancing:**
  - The Worker uses the `getRandom` helper from `@cloudflare/containers` to distribute API requests across multiple backend container instances.

**Example:**

- `GET /api/api1` → Routed to a Go container instance
- `GET /` → Returns the static frontend page

---

## Go Backend (net/http)

- **Framework:** Standard Go [`net/http`](https://pkg.go.dev/net/http)
- **Endpoints:** `/api/api1`, `/api/api2`, `/api/api3` (each returns a simple JSON response)
- **Port:** Listens on port `8080` (required by Cloudflare Containers)
- **Build:** Compiled as a single static binary using Go modules

---

## Building and Deploying

### Go Backend

- Built using Go modules:
  - `go build -o /server` (inside the Docker build)
- **Dockerfile:** Multi-stage build
  - **Build stage:** Compiles the Go binary in an Alpine environment
  - **Runtime stage:** Copies the binary into a minimal scratch image
- **Entrypoint:** Backend binary is `/server` and listens on port 8080

### Static Frontend

- Located in the `dist/` directory
- Served directly by Cloudflare Workers for non-API routes

### Deployment

- Use [Wrangler](https://developers.cloudflare.com/workers/wrangler/) to deploy:
  - `npx wrangler deploy`
- Wrangler handles asset upload, Worker deployment, and container image build/push
- Cloudflare automatically manages container scaling and routing

---

## Project Structure

```
cloudflare-containers-fe-be-go/
├── container_src/         # Go backend source code (net/http API)
│   ├── main.go            # Main Go application entrypoint
│   └── go.mod             # Go module manifest
├── dist/                  # Static frontend assets (HTML/JS)
│   └── index.html         # Main frontend page
├── src/
│   └── index.ts           # Cloudflare Worker entrypoint (TypeScript)
├── Dockerfile             # Multi-stage build for Go backend container
├── wrangler.jsonc         # Cloudflare deployment configuration
└── README.md              # Project documentation
```

- `container_src/`: Go backend, exposes API endpoints for `/api/*`
- `dist/`: Static frontend, served for non-API routes
- `src/index.ts`: Worker script, routes requests to containers or static assets
- `Dockerfile`: Builds and packages the Go backend for Cloudflare Containers
- `wrangler.jsonc`: Configures deployment, routing, and container settings

---

## Notes for the Demo

- The Worker acts as a smart gateway, routing API requests to containers and serving static content for all other routes
- The Go backend uses the standard library for fast, minimal HTTP handling and is built for minimal, containerized deployment
- The project is ready for Cloudflare's container orchestration, with all ports and entrypoints configured for compatibility
