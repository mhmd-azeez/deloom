import { generateId } from "./utils";

const SALT_LENGTH = 16;
const ITERATIONS = 100_000;
const KEY_LENGTH = 32;

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(SALT_LENGTH);
  crypto.getRandomValues(salt);
  const key = await deriveKey(password, salt);
  const keyBytes = new Uint8Array(await crypto.subtle.exportKey("raw", key) as ArrayBuffer);
  const saltHex = toHex(salt);
  const keyHex = toHex(keyBytes);
  return `${saltHex}:${keyHex}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [saltHex, keyHex] = hash.split(":");
  if (!saltHex || !keyHex) return false;
  const salt = fromHex(saltHex);
  const key = await deriveKey(password, salt);
  const keyBytes = new Uint8Array(await crypto.subtle.exportKey("raw", key) as ArrayBuffer);
  return toHex(keyBytes) === keyHex;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits", "deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: KEY_LENGTH * 8 },
    true,
    ["encrypt"]
  );
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export async function createSession(db: D1Database, userId: string): Promise<string> {
  const token = generateSessionToken();
  // 30 day expiry
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);
  await db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").bind(token, userId, expires).run();
  return token;
}

export async function validateSession(db: D1Database, token: string): Promise<{ userId: string; email: string } | null> {
  if (!token) return null;
  const row = await db.prepare(
    "SELECT s.user_id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > datetime('now')"
  ).bind(token).first<{ user_id: string; email: string }>();
  if (!row) return null;
  return { userId: row.user_id, email: row.email };
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE id = ?").bind(token).run();
}

export function getSessionToken(cookieHeader: string | undefined): string {
  if (!cookieHeader) return "";
  const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
  return match ? match[1] : "";
}

export function sessionCookie(token: string, maxAge: number = 30 * 24 * 60 * 60): string {
  return `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}
