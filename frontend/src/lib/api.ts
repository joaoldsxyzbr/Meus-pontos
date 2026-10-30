import type { ApiError as ApiErrorBody } from "../../../src/shared/contracts";

export class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "HttpError";
  }
}

/** Nunca armazena dados autenticados em cache, LocalStorage ou service worker. */
export async function api<T>(path: `/api/${string}`, options?: { method?: string; body?: unknown }): Promise<T> {
  const init: RequestInit = {
    method: options?.method ?? "GET",
    credentials: "same-origin",
    cache: "no-store"
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
  return data as T;
}
