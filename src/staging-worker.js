import worker from "./worker.js";

/**
 * Proteção extra de headers do ambiente de homologação.
 * A restrição de acesso é no roteamento Cloudflare: workers_dev e preview_urls
 * DESATIVADOS. Antes de abrir um hostname, exigir Cloudflare Access.
 */
export default {
  async fetch(request, env, ctx) {
    const response = await worker.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    const path = new URL(request.url).pathname;
    if (path === "/" || path === "/index.html" ||
        path === "/sw.js" || path === "/manifest.webmanifest") {
      headers.set("Cache-Control", "no-store");
    } else if (/^\/assets\/.*\.[a-f0-9]{8,}\.(?:js|css)$/.test(path)) {
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
    }
    return new Response(response.body, { status: response.status, headers });
  }
};
