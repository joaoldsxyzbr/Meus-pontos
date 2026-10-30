const enc = new TextEncoder();
const COOKIE_NAME = "__Host-mp_session";
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const RECORD_PATTERN = /^v1:100000:([a-zA-Z0-9_-]{22}):([a-zA-Z0-9_-]{43})$/;

function decodeBase64(value) {
  if (!/^[a-zA-Z0-9_-]+$/.test(value) || value.length > 2048) return null;
  try {
    const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    const decoded = Uint8Array.from(raw, (character) => character.charCodeAt(0));
    // Base64url não canônico pode ter caracteres finais diferentes para os mesmos bytes.
    // Recusar essas variantes também protege a validação de cookies adulterados.
    return encodeBase64(decoded) === value ? decoded : null;
  } catch {
    return null;
  }
}

function encodeBase64(bytes) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function authConfigured(env) {
  return /^[a-zA-Z0-9._-]{3,40}$/.test(env.PONTO_USERNAME || "") &&
    RECORD_PATTERN.test(env.PONTO_PASSWORD_RECORD || "") &&
    Boolean(decodeBase64(env.PONTO_SESSION_SECRET || "")?.length === 32);
}

export async function checkCredentials(username, password, env) {
  if (typeof username !== "string" || typeof password !== "string" || password.length < 1 || password.length > 256) return false;
  const match = RECORD_PATTERN.exec(env.PONTO_PASSWORD_RECORD || "");
  if (!match) return false;
  const salt = decodeBase64(match[1]);
  const expected = decodeBase64(match[2]);
  if (!salt || !expected || expected.length !== 32) return false;

  const material = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const actual = new Uint8Array(await crypto.subtle.deriveBits({
    name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256"
  }, material, 256));
  let mismatch = 0;
  for (let i = 0; i < actual.length; i++) mismatch |= actual[i] ^ expected[i];
  return mismatch === 0 && username.toLowerCase() === env.PONTO_USERNAME.toLowerCase();
}

async function signatureKey(env) {
  return crypto.subtle.importKey("raw", decodeBase64(env.PONTO_SESSION_SECRET), {
    name: "HMAC", hash: "SHA-256"
  }, false, ["sign", "verify"]);
}

export async function createSession(env) {
  const payload = enc.encode(JSON.stringify({
    username: env.PONTO_USERNAME,
    expires: Date.now() + SESSION_SECONDS * 1000,
    random: encodeBase64(crypto.getRandomValues(new Uint8Array(16)))
  }));
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await signatureKey(env), payload));
  return "v1." + encodeBase64(payload) + "." + encodeBase64(signature);
}

export async function verifySession(request, env) {
  const header = request.headers.get("Cookie") || "";
  const cookie = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(COOKIE_NAME + "="));
  if (!cookie) return false;
  const token = cookie.slice(COOKIE_NAME.length + 1);
  if (token.length > 1200) return false;
  const pieces = token.split(".");
  if (pieces.length !== 3 || pieces[0] !== "v1") return false;
  const payload = decodeBase64(pieces[1]);
  const mac = decodeBase64(pieces[2]);
  if (!payload || !mac || mac.length !== 32) return false;

  try {
    const valid = await crypto.subtle.verify("HMAC", await signatureKey(env), mac, payload);
    if (!valid) return false;
    const parsed = JSON.parse(new TextDecoder().decode(payload));
    return parsed.username === env.PONTO_USERNAME &&
      Number.isSafeInteger(parsed.expires) &&
      parsed.expires > Date.now() &&
      parsed.expires <= Date.now() + SESSION_SECONDS * 1000 &&
      typeof parsed.random === "string";
  } catch {
    return false;
  }
}

export function sessionCookie(token) {
  return COOKIE_NAME + "=" + token + "; Path=/; Max-Age=" + SESSION_SECONDS +
    "; HttpOnly; Secure; SameSite=Strict";
}

export function clearSessionCookie() {
  return COOKIE_NAME + "=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict";
}
