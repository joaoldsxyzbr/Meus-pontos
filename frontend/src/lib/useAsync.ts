import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: unknown;
}

/**
 * Carregamento assíncrono com descarte de respostas obsoletas.
 * Substitui os contadores manuais de sequência: cada nova requisição
 * aborta a anterior, e resultados de requisições canceladas são ignorados.
 */
export function useAsync<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[]
): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  const [tick, setTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setState((previous) => ({ ...previous, loading: true, error: null }));

    loadRef.current(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ data, loading: false, error: null });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ data: null, loading: false, error });
      }
    );
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { ...state, reload };
}
