import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const staging = path.resolve(root, "dist/staging");
const release = path.resolve(root, "dist/release");

/**
 * O build de produção usa o MESMO pacote Svelte/PWA já testado em staging
 * local. Não importa IDs D1 ou credenciais.
 */
const built = spawnSync(process.execPath, ["scripts/build-staging.mjs"], {
  cwd: root, env: { ...process.env }, stdio: "inherit"
});
if (built.error || built.status !== 0) {
  throw new Error("Falha ao gerar o shell Svelte; a publicação foi abortada.");
}

await rm(release, { recursive: true, force: true });
await mkdir(release, { recursive: true });
await cp(staging, release, { recursive: true });
const htmlPath = path.join(release, "index.html");
const html = await readFile(htmlPath, "utf8");
if (!html.includes("Meus Pontos — Svelte 5 (piloto)")) {
  throw new Error("HTML Svelte inesperado: não alterar a interface de produção.");
}
await writeFile(htmlPath, html
  .replace("Meus Pontos — Svelte 5 (piloto)", "Meus Pontos")
  .replace("Piloto da interface Svelte 5 do Meus Pontos.",
    "Registre seus pontos e acompanhe seu banco de horas.")
);

console.log("Pacote Svelte de publicação preparado (não implantado).");
