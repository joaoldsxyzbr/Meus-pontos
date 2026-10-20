import { randomBytes, pbkdf2Sync } from "node:crypto";

const username = process.argv[2];
if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username || "")) {
  console.error("Uso: node scripts/criar-login.mjs seu-usuario");
  process.exitCode = 1;
} else {
  const password = randomBytes(24).toString("base64url");
  const salt = randomBytes(16).toString("base64url");
  const hash = pbkdf2Sync(password, Buffer.from(salt, "base64url"), 100000, 32, "sha256").toString("base64url");
  const secret = randomBytes(32).toString("base64url");
  console.log("\nUSUÁRIO: " + username);
  console.log("SENHA INICIAL: " + password);
  console.log("\nConfigure no Worker Cloudflare como 3 SECRETS:");
  console.log("PONTO_USERNAME = " + username);
  console.log("PONTO_PASSWORD_RECORD = v1:100000:" + salt + ":" + hash);
  console.log("PONTO_SESSION_SECRET = " + secret);
  console.log("\nA senha aparece apenas nesta execução. Guarde-a em local seguro. Não adicione estes valores ao GitHub.");
  console.log("Ao trocar a senha, reconfigure os 3 secrets para invalidar sessões antigas.\n");
}
