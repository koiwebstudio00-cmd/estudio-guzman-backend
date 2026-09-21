import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("production artifacts", () => {
  it("publishes an OpenAPI contract and executable operational scripts", () => {
    const contract = readFileSync(new URL("../../docs/openapi.yaml", import.meta.url), "utf8");
    expect(contract).toContain("openapi: 3.1.0"); expect(contract).toContain("/audit-logs:"); expect(contract).toContain("/notifications:");
    for (const name of ["backup.sh", "restore.sh", "smoke.sh"]) expect(statSync(new URL(`../../scripts/${name}`, import.meta.url)).mode & 0o111).not.toBe(0);
  });

  it("uses production credentials for bootstrap and a Docker-compatible ClamAV healthcheck", () => {
    const bootstrap = readFileSync(new URL("../../scripts/bootstrap-admin.ts", import.meta.url), "utf8");
    const compose = readFileSync(new URL("../../docker-compose.prod.yml", import.meta.url), "utf8");
    expect(bootstrap).toContain("process.env.DATABASE_URL_MIGRATE ?? process.env.DATABASE_URL");
    expect(compose).toContain("nc 127.0.0.1 3310");
    expect(compose).toContain("start_period: 2m");
  });
});
