import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export class TokenService {
  generate(bytes = 32): string {
    return randomBytes(bytes).toString("base64url");
  }

  hash(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }

  deriveCsrf(sessionToken: string): string {
    return createHash("sha256").update(`csrf:${sessionToken}`, "utf8").digest("base64url");
  }

  matches(token: string, expectedHash: string): boolean {
    if (!/^[0-9a-f]{64}$/.test(expectedHash)) return false;
    const actual = Buffer.from(this.hash(token), "hex");
    const expected = Buffer.from(expectedHash, "hex");
    return timingSafeEqual(actual, expected);
  }
}

export const tokenService = new TokenService();
