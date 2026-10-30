import type { ApiError as ApiErrorBody } from "../../../src/shared/contracts";

export class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "HttpError";
  }
}

/** Nunca armazena dados autenticados em cache, LocalStorage ou service worker. */
export async function api<T>(path: `/api/${string}`, options?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(path, {
    method: options?.method ?? "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: options?.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: options?.body === undefined ? undefined : JSON.stringify(options.body)
  });

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
