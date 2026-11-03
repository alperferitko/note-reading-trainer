import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import { createAIHttpHandler } from "../_shared/ai/http-handler.mjs";
import { createSupabaseAuthenticator } from "../_shared/ai/supabase-auth.mjs";
import { createLocalMockGateway, localMockConfig } from "../_shared/ai/local-mock.mjs";
import { stagingConfig } from "../_shared/ai/staging-config.mjs";
import { createStagingGateway } from "../_shared/ai/staging-gateway.mjs";
import pins from "../_shared/ai/staging-target.mjs";

// Match the existing Edge entry pattern without leaking Deno globals into frontend types.
const runtime = (globalThis as typeof globalThis & {
  Deno: {
    env: { get(name: string): string | undefined };
    serve(handler: (request: Request) => Response | Promise<Response>): void;
  };
}).Deno;

const get = (name: string) => runtime.env.get(name);
const local = localMockConfig(get);
const staging = stagingConfig(get, pins);
const config = local ?? staging;
const handler = config
  ? createAIHttpHandler({
    gateway: local ? createLocalMockGateway() : createStagingGateway({ config: staging, createClient, transport: globalThis.fetch }),
    authenticate: createSupabaseAuthenticator({ createClient, url: config.url, publishableKey: config.publishableKey }),
    allowedOrigins: config.allowedOrigins,
  })
  : createAIHttpHandler({ enabled: false });

runtime.serve(handler);