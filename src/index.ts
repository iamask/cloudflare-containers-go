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
  enableInternet = true;

  envVars = {
    APP_ENV: "production",
    SERVICE: "go",
  };

  override onStart(): void {
    console.log("GoBackend Container started!");
  }
}

// Express Linux Command Container.
export class LinuxCommandContainer extends Container {
  defaultPort = 8081;
  sleepAfter = "2h";

  // Method to store current date/time when Durable Object proxies request to container
  async storeRequestTimestamp(): Promise<void> {
    const currentDateTime = new Date().toISOString();
    await this.ctx.storage.put("lastRequestTimestamp", currentDateTime);
    console.log("[DEBUG] Timestamp stored successfully:", currentDateTime);
  }

  // Override the Durable Object's fetch method
  async fetch(request: Request): Promise<Response> {
    await this.storeRequestTimestamp();
    // Proxy the request to the container on the default port (8081)
    const containerResponse = await this.containerFetch(request, this.defaultPort);
    console.log("Last Request Timestamp: " + (await this.ctx.storage.get("lastRequestTimestamp")));
    return containerResponse;
  }
}

const INSTANCE_COUNT = 3;

// entry point for the application;
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 1. Generate response from the worker
    if (url.pathname === "/test1") {
      return new Response("Hello, World!!!", { status: 200 });
    }

    // 2. Proxy request to external service
    if (url.pathname === "/test2") {
      let response = await fetch("https://httpbin.org/get");
      response = new Response(response.body, response);
      response.headers.set("x-custom-header", "cloudflare-worker");
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

    // 5. route request to the workers ai service.
    if (url.pathname === "/ai") {
      const input = url.searchParams.get("prompt");
      const response = await env.AI.run("@cf/openai/gpt-oss-120b", {
        instructions: "You are a friendly agent",
        input,
      });
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 6. route request to another worker
    if (url.pathname.startsWith("/worker")) {
      return env.WORKER_SERVICE.fetch(request);
    }

    // 7. route request to the Golang server container
    if (url.pathname.startsWith("/api")) {
      const containerInstance = await getRandom(env.BACKEND, INSTANCE_COUNT);
      // containerInstance.fetch(request) is calling the Durable Object’s own fetch() method
      const response = await containerInstance.fetch(request);
      return response;
    }

    // 8. route request to the Linux command container
    if (url.pathname === "/run") {
      const containerInstance = await getRandom(env.LINUX_COMMAND, INSTANCE_COUNT);
      const response = await containerInstance.fetch(request);
      console.log(`[DEBUG] Container response status: ${response.status}`);
      return response;
    }

    return new Response("Not Found", { status: 404 });
  },
};
