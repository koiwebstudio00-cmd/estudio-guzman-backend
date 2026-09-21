import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../../config.js";

export interface PasswordResetMessage {
  tokenId: string;
  email: string;
  token: string;
  expiresAt: Date;
}

export interface PasswordResetDelivery {
  deliver(message: PasswordResetMessage): Promise<void>;
  consume?(tokenId: string): Promise<void>;
}

export class LocalFilePasswordResetDelivery implements PasswordResetDelivery {
  private readonly directory = path.join(config.STORAGE_ROOT, ".private", "password-resets");

  async deliver(message: PasswordResetMessage): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await writeFile(
      path.join(this.directory, `${message.tokenId}.json`),
      JSON.stringify(
        {
          email: message.email,
          token: message.token,
          expiresAt: message.expiresAt.toISOString()
        },
        null,
        2
      ),
      { encoding: "utf8", mode: 0o600 }
    );
  }

  async consume(tokenId: string): Promise<void> {
    await rm(path.join(this.directory, `${tokenId}.json`), { force: true });
  }
}

export class NoopPasswordResetDelivery implements PasswordResetDelivery {
  async deliver(): Promise<void> {}
}

export function createPasswordResetDelivery(): PasswordResetDelivery {
  return config.NODE_ENV === "production"
    ? new NoopPasswordResetDelivery()
    : new LocalFilePasswordResetDelivery();
}
