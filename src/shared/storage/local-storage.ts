import { randomUUID } from "node:crypto";
import { constants, createReadStream, createWriteStream, type ReadStream, type WriteStream } from "node:fs";
import { access, mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { config } from "../../config.js";
import { ApiError } from "../http/errors.js";

export class LocalStorageService {
  readonly root: string;
  readonly temporaryRoot: string;

  constructor(root: string) {
    this.root = path.resolve(root);
    this.temporaryRoot = path.join(this.root, ".tmp");
  }

  async ensureReady(): Promise<void> {
    await mkdir(this.temporaryRoot, { recursive: true, mode: 0o700 });
    await access(this.root, constants.R_OK | constants.W_OK);
    await access(this.temporaryRoot, constants.R_OK | constants.W_OK);
  }

  resolveKey(key: string): string {
    const normalized = key.replaceAll("\\", "/");
    if (!normalized || normalized.includes("\0") || path.posix.isAbsolute(normalized) || normalized.split("/").includes("..")) {
      throw new ApiError("VALIDATION_ERROR", "Clave de archivo inválida.");
    }

    const resolved = path.resolve(this.root, normalized);
    if (resolved !== this.root && !resolved.startsWith(`${this.root}${path.sep}`)) {
      throw new ApiError("VALIDATION_ERROR", "Clave de archivo inválida.");
    }
    return resolved;
  }

  async createTemporary(): Promise<{ id: string; writable: WriteStream }> {
    await this.ensureReady();
    const id = randomUUID();
    return { id, writable: createWriteStream(this.temporaryPath(id), { flags: "wx", mode: 0o600 }) };
  }

  async moveFromTemporary(temporaryId: string, key: string): Promise<void> {
    const destination = this.resolveKey(key);
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await rename(this.temporaryPath(temporaryId), destination);
  }

  async deleteTemporary(temporaryId: string): Promise<void> {
    await unlink(this.temporaryPath(temporaryId)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }

  openReadStream(key: string): ReadStream {
    return createReadStream(this.resolveKey(key));
  }

  async size(key: string): Promise<number> {
    return (await stat(this.resolveKey(key))).size;
  }

  async exists(key: string): Promise<boolean> {
    const filename = this.resolveKey(key);
    try { await access(filename, constants.R_OK); return true; } catch { return false; }
  }

  async delete(key: string): Promise<void> {
    await unlink(this.resolveKey(key)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }

  async cleanupTemporaryOlderThan(cutoff: Date): Promise<number> {
    await this.ensureReady();
    const entries = await readdir(this.temporaryRoot, { withFileTypes: true });
    let removed = 0;
    for (const entry of entries) {
      if (!entry.isFile() || !/^[0-9a-f-]{36}$/.test(entry.name)) continue;
      const filename = this.temporaryPath(entry.name);
      if ((await stat(filename)).mtime < cutoff) { await unlink(filename); removed += 1; }
    }
    return removed;
  }

  private temporaryPath(id: string): string {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new ApiError("VALIDATION_ERROR", "Temporal inválido.");
    return path.join(this.temporaryRoot, id);
  }
}

export const storage = new LocalStorageService(config.STORAGE_ROOT);
