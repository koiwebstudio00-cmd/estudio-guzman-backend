import { describe, expect, it } from "vitest";
import type { DestinationStream } from "pino";
import { createLogger } from "../../src/shared/logging/logger.js";

describe("security logging", () => {
  it("redacts passwords, tokens, authorization and cookies", () => {
    const chunks: string[] = [];
    const destination: DestinationStream = {
      write(chunk: string) {
        chunks.push(chunk);
      }
    };
    const logger = createLogger(destination);

    logger.fatal({
      password: "secret-password",
      token: "secret-token",
      req: {
        headers: { authorization: "Bearer secret", cookie: "eg_session=secret-cookie" },
        body: { password: "nested-password", token: "nested-token" }
      }
    });

    const output = chunks.join("");
    expect(output).toContain("[REDACTED]");
    expect(output).not.toContain("secret-password");
    expect(output).not.toContain("secret-token");
    expect(output).not.toContain("nested-password");
    expect(output).not.toContain("nested-token");
    expect(output).not.toContain("secret-cookie");
    expect(output).not.toContain("Bearer secret");
  });
});
