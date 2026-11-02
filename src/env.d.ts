/**
 * Bindings do Worker meus-pontos. Tipos estruturais mínimos, sem dependência
 * de @cloudflare/workers-types: o contrato atual usa apenas estes membros.
 */

interface D1Result<T = unknown> {
  results?: T[];
  success?: boolean;
  meta: { changes?: number; last_row_id?: number };
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run<T = unknown>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

interface AssetsFetcher {
  fetch(request: Request): Promise<Response>;
}

interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface Env {
  DB: D1Database;
  ASSETS?: AssetsFetcher;
  LOGIN_LIMITER?: RateLimiter;
  PONTO_USERNAME?: string;
  PONTO_PASSWORD_RECORD?: string;
  PONTO_SESSION_SECRET?: string;
}
