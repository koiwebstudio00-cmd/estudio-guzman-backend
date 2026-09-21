import { performance } from "node:perf_hooks";
import { passwordService } from "../src/modules/auth/password.service.js";
const samples = Number(process.argv[2] ?? 5); if (!Number.isInteger(samples) || samples < 3 || samples > 20) throw new Error("Uso: npm run security:benchmark-argon2 -- 5");
const values: number[] = []; for (let index = 0; index < samples; index += 1) { const started = performance.now(); await passwordService.hash(`benchmark-${index}-ClaveSegura123`); values.push(performance.now() - started); }
values.sort((a, b) => a - b); const percentile = (ratio: number) => values[Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)]!;
console.log(JSON.stringify({ samples, memoryKiB: process.env.ARGON2_MEMORY_KIB ?? "65536", timeCost: process.env.ARGON2_TIME_COST ?? "3", parallelism: process.env.ARGON2_PARALLELISM ?? "1", p50Ms: Math.round(percentile(0.5)), p95Ms: Math.round(percentile(0.95)), maxMs: Math.round(values.at(-1)!) }, null, 2));
