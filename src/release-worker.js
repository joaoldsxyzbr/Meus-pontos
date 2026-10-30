import app from "./worker.js";

/**
 * Preserva toda a API, login, CSRF e bindings existentes.
 * Apenas headers de assets são ajustados para a atualização da PWA.
 */
export default {
  async fetch(request, env, ctx) {
    const pathname = new URL(request.url).pathname;
    const response = await app.fetch(request, env, ctx);
    if (pathname.startsWith("/api/")) return response;

    const headers = new Headers(response.headers);
    if (pathname === "/" || pathname === "/index.html" ||
        pathname === "/sw.js" || pathname === "/manifest.webmanifest") {
      headers.set("Cache-Control", "no-store");
    } else if (/^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css)$/.test(pathname)) {
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
    } else if ([
      "/app.js", "/ajustes.js", "/correcoes.js",
      "/styles.css", "/ajustes.css", "/correcoes.css"
    ].includes(pathname)) {
      headers.set("Cache-Control", "no-store");
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
