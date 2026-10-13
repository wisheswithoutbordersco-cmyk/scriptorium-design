import { randomBytes, scryptSync } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { verifyOwnerPassword } from "./_core/ownerAuth";

const originalHash = process.env.OWNER_PASSWORD_HASH;

function makePasswordHash(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, {
    N: 32_768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$32768$8$1$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

afterEach(() => {
  if (originalHash === undefined) delete process.env.OWNER_PASSWORD_HASH;
  else process.env.OWNER_PASSWORD_HASH = originalHash;
});

describe("owner password authentication", () => {
  it("verifies the password using the stored scrypt hash without storing plaintext", async () => {
    process.env.OWNER_PASSWORD_HASH = makePasswordHash(
      "test-only-owner-password"
    );
    await expect(verifyOwnerPassword("test-only-owner-password")).resolves.toBe(
      true
    );
    await expect(verifyOwnerPassword("not-the-password")).resolves.toBe(false);
  });

  it("rejects missing, malformed, empty, and excessively long credentials", async () => {
    delete process.env.OWNER_PASSWORD_HASH;
    await expect(verifyOwnerPassword("test-only-owner-password")).resolves.toBe(
      false
    );
    process.env.OWNER_PASSWORD_HASH = "not-a-scrypt-hash";
    await expect(verifyOwnerPassword("test-only-owner-password")).resolves.toBe(
      false
    );
    await expect(verifyOwnerPassword("")).resolves.toBe(false);
    await expect(verifyOwnerPassword("x".repeat(1_025))).resolves.toBe(false);
  });
});
