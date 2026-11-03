/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_GOOGLE_AUTH_ENABLED?: string;
  /** Pinned staging ai-gateway URL, or a loopback mock. Any other value is ignored by lib/ai-client.mjs. */
  readonly VITE_AI_GATEWAY_URL?: string;
  /** "true" only in builds whose Supabase project has the score library migration (staging). */
  readonly VITE_SCORE_LIBRARY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface D1Database {
  prepare(query: string): unknown;
}

declare module "cloudflare:workers" {
  export const env: {
    DB?: D1Database;
    [binding: string]: unknown;
  };
}
