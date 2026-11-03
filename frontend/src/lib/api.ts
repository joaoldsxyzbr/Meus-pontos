import type { z } from "zod";
import type { ApiError as ApiErrorBody } from "../../../src/shared/contracts.ts";

export class HttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/** Resposta recebida mas fora do contrato esperado. */
export class ContractError extends Error {
  constructor(readonly path: string) {
    super("Resposta do servidor em formato inesperado. Atualize o aplicativo.");
    this.name = "ContractError";
  }
}

/**
 * Nunca armazena dados autenticados em cache, LocalStorage ou service worker.
 * Quando um schema é informado, a resposta é validada antes de chegar à tela.
 */
export async function api<T>(
  path: `/api/${string}`,
  options?: { method?: string; body?: unknown; signal?: AbortSignal; schema?: z.ZodType<T> }
): Promise<T> {
  const init: RequestInit = {
    method: options?.method ?? "GET",
    credentials: "same-origin",
    cache: "no-store",
    signal: options?.signal ?? null
  };
  if (options?.body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(options.body);
  }
  const response = await fetch(path, init);

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new HttpError("Resposta inválida do servidor.", response.status);
  }
  if (!response.ok) {
    const error = data as Partial<ApiErrorBody> | null;
    throw new HttpError(
      typeof error?.error === "string" ? error.error : "Ocorreu um erro na consulta.",
      response.status
    );
  }
  if (!options?.schema) return data as T;
  const parsed = options.schema.safeParse(data);
  if (!parsed.success) throw new ContractError(path);
  return parsed.data;
}
