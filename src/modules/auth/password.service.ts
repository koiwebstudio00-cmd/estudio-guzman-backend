import argon2 from "argon2";
import { config } from "../../config.js";

const options = {
  type: argon2.argon2id,
  memoryCost: config.ARGON2_MEMORY_KIB,
  timeCost: config.ARGON2_TIME_COST,
  parallelism: config.ARGON2_PARALLELISM
} as const;

export const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,p=1,t=3$Qe4TrgYMqNc+zHobJUxQZA$p2Z6UKIQp9LphTgAXhvorsXKo2Y505PUxBCqVbPitiM";

export class PasswordService {
  hash(password: string): Promise<string> {
    return argon2.hash(password, options);
  }

  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, options);
  }
}

export const passwordService = new PasswordService();
