import { Container, getRandom } from "@cloudflare/containers";

export interface Env {
  BACKEND: DurableObjectNamespace<GoBackend>;
  LINUX_COMMAND: DurableObjectNamespace<LinuxCommandContainer>;
  MY_KV: KVNamespace;
  PUBLIC: R2Bucket;
  AI: any;
  SECRET_STORE: SecretsStoreSecret;
  WORKER_SERVICE: Fetcher;
}
//  GoBackend class for API
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

// Express Linux Command Container
export class LinuxCommandContainer extends Container {
  defaultPort = 8081;
  sleepAfter = "2h";
  autoscale = true;
  dockerfile = "Dockerfile.linux";

  envVars = {
    APP_ENV: "production",
    SERVICE: "express.js-linux",
    MESSAGE:
      "Linux Command Container - Start Time: " + new Date().toISOString(),
  };

  ctx: DurableObjectState;

  constructor(ctx: DurableObjectState, env: any) {
    console.log("[DEBUG] DO initialized");
    super(ctx, env);
    this.ctx = ctx;
  }

  override onStart(): void {
    console.log("Linux Command Container started!");
  }

  // Method to store current date/time when Durable Object proxies request to container
  async storeRequestTimestamp(): Promise<void> {
    if (this.ctx?.storage) {
      try {
        const currentDateTime = new Date().toISOString();
        await this.ctx.storage.put("lastRequestTimestamp", currentDateTime);
        console.log("[DEBUG] Timestamp stored successfully");
      } catch (error) {
        console.error("[ERROR] Failed to store timestamp:", error);
      }
    }
  }

  async getLastRequestTimestamp(): Promise<string | null> {
    const lastRequestTimestamp = (await this.ctx?.storage?.get(
      "lastRequestTimestamp"
    )) as string | null;
    console.log("[DEBUG] Last request timestamp:", lastRequestTimestamp);
    return lastRequestTimestamp;
  }

  // Override the Durable Object's fetch method to proxy requests to the container's fetch method
  async fetch(request: Request): Promise<Response> {
    try {
      await this.storeRequestTimestamp();

      // Proxy the request to the container on the default port (8081)
      const containerResponse = await this.containerFetch(
        request,
        this.defaultPort
      );

      return containerResponse;
    } catch (error) {
      console.error("Error proxying to container:", error);
      return new Response(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
        {
          status: 500,
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

const INSTANCE_COUNT = 3;

// entry point for the application;
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 1. Generate response from the worker
    if (url.pathname === "/test1") {
      return new Response("Hello, World!", { status: 200 });
    }

    // 2. Proxy request to external service
    if (url.pathname === "/test2") {
      let response = await fetch("https://httpbin.org/get");
      return response;
    }

    // 3. route request to the kv namespace
    if (url.pathname === "/kv") {
      const value = await env.MY_KV.get("demo-key");
      return new Response(JSON.stringify({ key: "demo-key", value }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 4. route request to the r2 bucket and return optimized image
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

    // 5. route request to the workers ai service
    if (url.pathname === "/ai") {
      const prompt =
        url.searchParams.get("prompt") ||
        "What is the origin of the phrase Hello, World?";
      const response = await env.AI.run("@cf/openai/gpt-oss-120b", {
        prompt,
      });
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 6. route request to the service worker
    if (url.pathname.startsWith("/worker")) {
      // Forward the request to the bound service worker
      return env.WORKER_SERVICE.fetch(request);
    }

    // 5. route request to the backend container
    if (url.pathname.startsWith("/api")) {
      // containerInstance.fetch(request) is calling the Durable Object’s own fetch() method
      const containerInstance = await getRandom(env.BACKEND, INSTANCE_COUNT);
      const response = await containerInstance.fetch(request);
      return response;
    }

    // 6. route request to the Linux command container
    if (url.pathname === "/run") {
      const containerInstance = await getRandom(
        env.LINUX_COMMAND,
        INSTANCE_COUNT
      );
      const response = await containerInstance.fetch(request);
      console.log(`[DEBUG] Container response status: ${response.status}`);
      return response;
    }

    return new Response("Not Found", { status: 404 });
  },
};
