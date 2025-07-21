import { Container, getRandom } from "@cloudflare/containers";
import { request } from "http";

// Temporary GoBackend class for migration purposes
export class GoBackend extends Container {
  defaultPort = 8080;
  sleepAfter = "2h";
  autoscale = true;

  envVars = {
    APP_ENV: "production",
    SEVICE: "go",
    MESSAGE: "GoBackend - Start Time: " + new Date().toISOString(),
  };

  override onStart(): void {
    console.log("GoBackend Container started!");
  }
  override onStop() {
    console.log("GoBackend Container successfully shut down");
  }
  override onError(error: unknown): any {
    console.error("GoBackend Container error:", error);
    throw error;
  }
}

// Expres Linux Command Container
export class LinuxCommandContainer extends Container {
  defaultPort = 8081;
  sleepAfter = "2h";
  autoscale = true;

  dockerfile = "Dockerfile.linux";

  // Storage for Durable Object functionality
  private durableStorage?: DurableObjectStorage;

  // Initialize storage in the constructor
  constructor(state: DurableObjectState, env: Env) {
    console.log("[DEBUG] DO initialized");
    super(state, env); // Call the parent class constructor with required arguments
    this.durableStorage = state.storage;
  }

  envVars = {
    APP_ENV: "production",
    SEVICE: "express.js-linux",
    MESSAGE:
      "Linux Command Container - Start Time: " + new Date().toISOString(),
  };

  override onStart(): void {
    console.log("Linux Command Container started!");
  }

  // Method to store current date/time when Durable Object proxies request to container
  async storeRequestTimestamp(): Promise<void> {
    if (this.durableStorage) {
      try {
        const currentDateTime = new Date().toISOString();
        await this.durableStorage.put("lastRequestTimestamp", currentDateTime);
        console.log("[DEBUG] Timestamp stored successfully");
      } catch (error) {
        console.error("[ERROR] Failed to store timestamp:", error);
        // Don't throw - storage failure shouldn't break request processing
      }
    }
  }

  // Method to get last request timestamp
  async getLastRequestTimestamp(): Promise<string | null> {
    if (!this.durableStorage) return null;
    return (await this.durableStorage.get("lastRequestTimestamp")) as
      | string
      | null;
  }

  // Override DO proxy fetch method
  async fetch(request: Request): Promise<Response> {
    // Store current date/time whenever Durable Object proxies request to this container
    await this.storeRequestTimestamp();

    // Start the container if not already running
    await this.start();

    // Proxy the request to the actual container application
    // State can be accessed from Storage API and passed to container
    try {
      // Forward the request to the container
      console.log("[DEBUG] Proxying request to container");
      const containerResponse = await super.fetch(request);
      return containerResponse;
    } catch (error) {
      console.error("Error proxying to container:", error);
      // Fallback response if container fails
      return new Response(
        JSON.stringify({
          message: `Fallback error from Durable Object ; Last request timestamp: ${await this.getLastRequestTimestamp()}`,
          timestamp: new Date().toISOString(),
          error: "Container not available",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  override onStop() {
    console.log("Linux Command Container shut down");
  }

  override onError(error: unknown): any {
    console.error("Linux Command Container error:", error);
    throw error;
  }
}

// Bindings for the application
export interface Env {
  BACKEND: DurableObjectNamespace<GoBackend>;
  LINUX_COMMAND: DurableObjectNamespace<LinuxCommandContainer>;
  MY_KV: KVNamespace;
  PUBLIC: R2Bucket;
  AI: any;
  SECRET_STORE: SecretsStoreSecret;
  WORKER_SERVICE: Fetcher;
}

const INSTANCE_COUNT = 2;

// entry point for the application
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    console.log(`[DEBUG] Incoming request: ${request.method} ${url.pathname}`);
    console.log(`[DEBUG] Full URL: ${url.href}`);

    // route request to the backend container
    if (url.pathname.startsWith("/api")) {
      console.log(
        `[DEBUG] Matched /api route, attempting to get Go backend container instance`
      );
      // note: "getRandom" to be replaced with latency-aware routing in the near future
      // this is a temporary helper
      const containerInstance = await getRandom(env.BACKEND, INSTANCE_COUNT);
      const response = await containerInstance.fetch(request);
      return response;
    }

    // route request to the Linux command container
    if (url.pathname === "/run") {
      console.log(
        `[DEBUG] Matched /run route, attempting to get Linux command container instance`
      );
      const containerInstance = await getRandom(
        env.LINUX_COMMAND,
        INSTANCE_COUNT
      );
      console.log(
        `[DEBUG] Got Linux command container instance, forwarding request`
      );
      const response = await containerInstance.fetch(request);
      console.log(`[DEBUG] Container response status: ${response.status}`);
      return response;
    }

    // route request to the kv namespace
    if (url.pathname === "/kv") {
      console.log(`[DEBUG] Matched /kv route, attempting to get value`);
      const value = await env.MY_KV.get("demo-key");
      return new Response(JSON.stringify({ key: "demo-key", value }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // route request to the r2 bucket and return optimized image
    if (url.pathname === "/image") {
      // Fetch image from R2 and resize using fetch(..., { cf: { image: ... } })
      const imageKey = "ai-generated/1746948849155-zjng9a.jpg";
      const r2Object = await env.PUBLIC.get(imageKey);
      if (!r2Object || !r2Object.body) {
        return new Response("Image not found", { status: 404 });
      }
      // Get width and height from query params, default to 100x100
      const width = parseInt(url.searchParams.get("width") || "100", 10);
      const height = parseInt(url.searchParams.get("height") || "100", 10);
      return new Response(r2Object.body, {
        headers: {
          "Content-Type": r2Object.httpMetadata?.contentType || "image/jpeg",
        },
        cf: {
          image: {
            width,
            height,
            fit: "cover",
            format: "avif",
          },
        },
      });
    }

    // route request to the workers ai service
    if (url.pathname === "/ai") {
      console.log(`[DEBUG] Matched /ai route, attempting to get AI response`);
      const prompt =
        url.searchParams.get("prompt") ||
        "What is the origin of the phrase Hello, World?";
      const response = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        prompt,
      });
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // route request to the service worker
    if (url.pathname.startsWith("/worker")) {
      console.log(
        `[DEBUG] Matched /worker route, forwarding request to service worker`
      );
      // Forward the request to the bound service worker
      return env.WORKER_SERVICE.fetch(request);
    }

    console.log(`[DEBUG] No route matched for ${url.pathname}, returning 404`);
    return new Response("Not Found", { status: 404 });
  },
};

/*
// Hono-based implementation 
const app = new Hono<{ Bindings: Env }>();

app.all("/api/*", async (c) => {
  const env = c.env;
  const containerInstance = await getRandom(env.BACKEND, INSTANCE_COUNT);
  return containerInstance.fetch(c.req.raw);
});

app.get("/kv", async (c) => {
  const value = await c.env.MY_KV.get("demo-key");
  return c.json({ key: "demo-key", value });
});

app.all("*", (c) => c.text("Not Found", 404));

export default app;
*/
