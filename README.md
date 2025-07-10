# Cloudflare Containers Demo: Go Backend + TypeScript Worker

## Architecture Overview

```mermaid
graph TD;
    A[ Entrypoint worker cloudflare-containers-go]
    A -- "Workers AI" --> AI[AI]
    A -- "Durable Object" --> BACKEND[BACKEND]
    A -- "Images" --> IMAGES[IMAGES]
    A -- "KV namespace" --> MY_KV[MY_KV]
    A -- "R2 bucket" --> PUBLIC[PUBLIC]
```

---

## Endpoint to Resource Mapping

| Endpoint Pattern      | Cloudflare Resource        | Description                       |
| --------------------- | -------------------------- | --------------------------------- |
| `/api/*`              | Durable Object (Container) | Proxies to Go backend container   |
| `/kv`                 | KV Namespace               | Fetches value from Cloudflare KV  |
| `/image`              | R2 Bucket + Images         | Fetches and resizes image from R2 |
| `/ai`                 | Workers AI                 | Runs inference using Workers AI   |
| `/` (static frontend) | Static Asset               | Served from Worker/dist           |

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
- `GET /api/api2` → Routed to a Go container instance
- `GET /api/heavycompute` → Routed to a Go container instance, runs a heavy compute (Fibonacci) for load testing
- `GET /api/responseheaders` → Routed to a Go container instance, returns the incoming request headers as JSON
- `GET /kv` → Returns a value from Cloudflare KV storage
- `GET /` → Returns the static frontend page

---

## Go Backend (net/http)

- **Framework:** Standard Go [`net/http`](https://pkg.go.dev/net/http)
- **Endpoints:**
  - `/api/api1` (returns a simple JSON response)
  - `/api/heavycompute` (runs a heavy compute operation and returns the result)
  - `/api/responseheaders` (returns the incoming request headers as JSON)
- **Port:** Listens on port `8080` (required by Cloudflare Containers)
- **Build:** Compiled as a single static binary using Go modules

---

## API Endpoints

| Endpoint               | Method | Description                                         |
| ---------------------- | ------ | --------------------------------------------------- |
| `/api/api1`            | GET    | Returns a simple JSON response                      |
| `/api/heavycompute`    | GET    | Runs a heavy compute (Fibonacci) and returns result |
| `/api/responseheaders` | GET    | Returns the incoming request headers as JSON        |
| `/kv`                  | GET    | Returns a value from Cloudflare KV storage          |
| `/image`               | GET    | Fetches and resizes an image from R2                |
| `/ai`                  | GET    | Runs inference using Workers AI                     |

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
