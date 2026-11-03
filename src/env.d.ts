/**
 * Bindings e secrets disponibilizados pelo Worker (Wrangler).
 * Mantém o contrato entre `wrangler.jsonc` e o código TypeScript.
 */
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  LOGIN_LIMITER: RateLimit;
  /** Configurados como secrets; ausentes mantêm a API em 503. */
  PONTO_USERNAME?: string;
  PONTO_PASSWORD_RECORD?: string;
  PONTO_SESSION_SECRET?: string;
}

/** Rate limit nativo Cloudflare exposto pelo binding `ratelimits`. */
export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}
