import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("production artifacts", () => {
  it("publishes an OpenAPI contract and executable operational scripts", () => {
    const contract = readFileSync(new URL("../../docs/openapi.yaml", import.meta.url), "utf8");
    expect(contract).toContain("openapi: 3.1.0"); expect(contract).toContain("/audit-logs:"); expect(contract).toContain("/notifications:");
    for (const name of ["backup.sh", "restore.sh", "smoke.sh"]) expect(statSync(new URL(`../../scripts/${name}`, import.meta.url)).mode & 0o111).not.toBe(0);
  });
});
