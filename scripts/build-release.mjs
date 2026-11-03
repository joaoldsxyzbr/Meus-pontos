import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const staging = path.resolve(root, "dist/staging");
const release = path.resolve(root, "dist/release");

/**
 * O build de produção usa o MESMO pacote PWA já testado em staging local.
 * Não importa IDs D1 ou credenciais.
 */
const built = spawnSync(process.execPath, ["scripts/build-staging.mjs"], {
  cwd: root, env: { ...process.env }, stdio: "inherit"
});
if (built.error || built.status !== 0) {
  throw new Error("Falha ao gerar o shell da PWA; a publicação foi abortada.");
}

await rm(release, { recursive: true, force: true });
await mkdir(release, { recursive: true });
await cp(staging, release, { recursive: true });

// O index.html já é gerado com o título e a descrição finais de produção.
const html = await readFile(path.join(release, "index.html"), "utf8");
if (!html.includes("<title>Meus Pontos</title>")) {
  throw new Error("HTML inesperado: título de produção ausente.");
}
if (/piloto/i.test(html)) {
  throw new Error("HTML inesperado: marcação de piloto não deve ir para produção.");
}

console.log("Pacote de publicação preparado (não implantado).");
