import { describe, expect, it } from "vitest";
import { ApiError } from "../src/shared/http/errors.js";
import { LocalStorageService } from "../src/shared/storage/local-storage.js";

describe("LocalStorageService", () => {
  const service = new LocalStorageService("/tmp/estudio-guzman-storage-test");

  it("resolves an opaque storage key inside its private root", () => {
    expect(service.resolveKey("cases/case-id/document-id/version-id")).toBe(
      "/tmp/estudio-guzman-storage-test/cases/case-id/document-id/version-id"
    );
  });

  it.each(["../outside", "/etc/passwd", "..\\outside", "\0invalid"])(
    "rejects unsafe key %s",
    (key) => {
      expect(() => service.resolveKey(key)).toThrow(ApiError);
    }
  );
});
