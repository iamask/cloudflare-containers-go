// import { Hono } from "hono";
import { Container, getRandom } from "@cloudflare/containers";

export class Backend extends Container {
  defaultPort = 8080;
  sleepAfter = "2h"; // Override sleep timeout
  autoscale = true; //unreleased feature
  //enableInternet = false;   // Whether to enable internet access for the container
  //Example Custom entrypoint to run in the container;Not applicable in this application
  //entrypoint = ['node', 'server.js', '--config', 'production.json'];
  envVars = {
    //custom env variables accssible within the conatiner
    MY_CUSTOM_VAR: "custom_value",
    ANOTHER_VAR: "custom_another_value",
    APP_ENV: "production",
    // LOG_LEVEL: 'info',
    //  MY_SECRET: this.env.MY_SECRET,
    // default env variables : https://developers.cloudflare.com/containers/platform-details/#environment-variables
  };

  //optional lifecycle methods https://github.com/cloudflare/containers
  // Lifecycle method called when container starts
  override onStart(): void {
    console.log("Container started!");
  }
  //optional
  // Lifecycle method called on errors
  override onError(error: unknown): any {
    console.error("Container error:", error);
    throw error;
  }
}

// Bindings for the application
export interface Env {
  BACKEND: DurableObjectNamespace<Backend>;
  MY_KV: KVNamespace;
  PUBLIC: R2Bucket;
  WORKFLOW_SERVICE: Fetcher;
  AI: any;
}

const INSTANCE_COUNT = 2;

// entry point for the application
// route based on path/headers/query params

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Default implementation forwards requests to the container
    // This will automatically renew the activity timeout
    const url = new URL(request.url);
    // route request to the backend container
    if (url.pathname.startsWith("/api")) {
      // note: "getRandom" to be replaced with latency-aware routing in the near future
      // this is a temporary helper
      const containerInstance = await getRandom(env.BACKEND, INSTANCE_COUNT);
      return containerInstance.fetch(request);
    }

    // route request to the kv namespace
    if (url.pathname === "/kv") {
      // Fetch a value from KV
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
