import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import type { Express, Request, Response } from "express";
import type { User } from "../../drizzle/schema";

const OWNER_COOKIE_NAME = "scriptorium_owner_session";
const SESSION_TTL_SECONDS = 24 * 60 * 60;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const DUMMY_SALT = Buffer.from("scriptorium-owner-password-dummy-salt");
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 8;

/** Stable synthetic identity; no row or OAuth account is required for the owner session. */
export const DIRECT_OWNER_OPEN_ID = "scriptorium:direct-owner";

type ScryptParameters = { N: number; r: number; p: number };
type ParsedPasswordHash = ScryptParameters & { salt: Buffer; hash: Buffer };
type LoginAttemptState = {
  count: number;
  windowEndsAt: number;
  blockedUntil: number;
};

const loginAttempts = new Map<string, LoginAttemptState>();

function deriveKey(
  password: string,
  salt: Buffer,
  params: ScryptParameters
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      { ...params, maxmem: SCRYPT_MAXMEM },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      }
    );
  });
}

function parsePasswordHash(
  value: string | undefined
): ParsedPasswordHash | null {
  if (!value) return null;
  const parts = value.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || N < 16_384 || N > 32_768 || (N & (N - 1)) !== 0)
    return null;
  if (r !== 8 || p !== 1) return null;

  try {
    const salt = Buffer.from(parts[4]!, "base64url");
    const hash = Buffer.from(parts[5]!, "base64url");
    if (salt.length < 16 || hash.length !== SCRYPT_KEY_LENGTH) return null;
    return { N, r, p, salt, hash };
  } catch {
    return null;
  }
}

/** Compares a submitted password against the server-only scrypt verifier. */
export async function verifyOwnerPassword(password: unknown): Promise<boolean> {
  if (
    typeof password !== "string" ||
    password.length === 0 ||
    password.length > 1_024
  ) {
    return false;
  }

  const parsed = parsePasswordHash(process.env.OWNER_PASSWORD_HASH);
  try {
    const candidate = await deriveKey(
      password,
      parsed?.salt ?? DUMMY_SALT,
      parsed ?? { N: 32_768, r: 8, p: 1 }
    );
    return Boolean(parsed && timingSafeEqual(candidate, parsed.hash));
  } catch {
    return false;
  }
}

function sessionSigningKey(): Buffer | null {
  const storedHash = process.env.OWNER_PASSWORD_HASH?.trim();
  if (typeof storedHash !== "string" || !parsePasswordHash(storedHash))
    return null;
  // Derive a purpose-specific signing key from the server-only password verifier.
  // Changing the password hash invalidates every previously issued owner session.
  return createHmac("sha256", storedHash)
    .update("scriptorium-owner-session-v1")
    .digest();
}

function readCookie(req: Request, name: string): string | null {
  const prefix = `${name}=`;
  const cookie = req.headers.cookie
    ?.split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(prefix));
  if (!cookie) return null;
  try {
    return decodeURIComponent(cookie.slice(prefix.length));
  } catch {
    return null;
  }
}

function createSessionToken(): string | null {
  const key = sessionSigningKey();
  if (!key) return null;
  const expiresAt = Math.floor(Date.now() / 1_000) + SESSION_TTL_SECONDS;
  const body = `v1.${expiresAt}.${randomBytes(18).toString("base64url")}`;
  const signature = createHmac("sha256", key).update(body).digest("base64url");
  return `${body}.${signature}`;
}

/** Returns true only for a current, correctly signed owner session cookie. */
export function isValidOwnerSession(req: Request): boolean {
  const token = readCookie(req, OWNER_COOKIE_NAME);
  const key = sessionSigningKey();
  if (!token || !key) return false;

  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return false;
  const expiresAt = Number(parts[1]);
  const now = Math.floor(Date.now() / 1_000);
  if (
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= now ||
    expiresAt > now + SESSION_TTL_SECONDS + 60
  ) {
    return false;
  }

  const body = parts.slice(0, 3).join(".");
  const expected = createHmac("sha256", key).update(body).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(parts[3]!, "base64url");
  } catch {
    return false;
  }
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

/** Resolves direct owner authentication without contacting Clerk or the database. */
export function resolveOwnerUser(req: Request): User | null {
  if (!isValidOwnerSession(req)) return null;
  const now = new Date();
  return {
    id: 0,
    openId: DIRECT_OWNER_OPEN_ID,
    name: "Scriptorium Owner",
    email: null,
    loginMethod: "owner-password",
    role: "admin",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
}

function isSameOrigin(req: Request): boolean {
  const origin = req.get("origin");
  if (!origin) return true;
  try {
    return (
      new URL(origin).host.toLowerCase() ===
      (req.get("host") ?? "").toLowerCase()
    );
  } catch {
    return false;
  }
}

function attemptKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function lockoutRemaining(req: Request): number {
  const key = attemptKey(req);
  const current = loginAttempts.get(key);
  const now = Date.now();
  if (!current) return 0;
  if (current.windowEndsAt <= now && current.blockedUntil <= now) {
    loginAttempts.delete(key);
    return 0;
  }
  return Math.max(0, current.blockedUntil - now);
}

function recordFailedAttempt(req: Request): void {
  const key = attemptKey(req);
  const now = Date.now();
  let current = loginAttempts.get(key);
  if (!current || current.windowEndsAt <= now) {
    current = {
      count: 0,
      windowEndsAt: now + LOGIN_WINDOW_MS,
      blockedUntil: 0,
    };
  }
  current.count += 1;
  if (current.count >= MAX_LOGIN_ATTEMPTS)
    current.blockedUntil = now + LOGIN_WINDOW_MS;
  loginAttempts.set(key, current);

  if (loginAttempts.size > 1_000) {
    loginAttempts.forEach((attempt, ip) => {
      if (attempt.windowEndsAt <= now && attempt.blockedUntil <= now)
        loginAttempts.delete(ip);
    });
  }
}

function ownerCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS * 1_000,
  };
}

function setNoStore(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
}

/** Installs same-origin endpoints for the separate /workspace owner login. */
export function registerOwnerAuth(app: Express): void {
  app.get("/api/owner/session", (req, res) => {
    setNoStore(res);
    res.json({ authenticated: isValidOwnerSession(req) });
  });

  app.post("/api/owner/login", async (req, res) => {
    setNoStore(res);
    if (!isSameOrigin(req)) {
      res.status(403).json({ error: "Invalid request" });
      return;
    }

    if (lockoutRemaining(req) > 0) {
      res.status(429).json({ error: "Too many attempts. Try again later." });
      return;
    }

    const authenticated = await verifyOwnerPassword(req.body?.password);
    if (!authenticated) {
      recordFailedAttempt(req);
      res.status(401).json({ error: "Invalid owner credentials" });
      return;
    }

    loginAttempts.delete(attemptKey(req));
    const token = createSessionToken();
    if (!token) {
      res.status(503).json({ error: "Owner login is not configured" });
      return;
    }

    res.cookie(OWNER_COOKIE_NAME, token, ownerCookieOptions());
    res.json({ success: true });
  });

  app.post("/api/owner/logout", (req, res) => {
    setNoStore(res);
    if (!isSameOrigin(req)) {
      res.status(403).json({ error: "Invalid request" });
      return;
    }

    const { maxAge: _maxAge, ...clearOptions } = ownerCookieOptions();
    res.clearCookie(OWNER_COOKIE_NAME, clearOptions);
    res.json({ success: true });
  });
}
