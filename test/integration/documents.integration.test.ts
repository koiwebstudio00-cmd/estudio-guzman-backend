import { createHash } from "node:crypto";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { disconnectDatabase } from "../../src/database/prisma.js";
import { passwordService } from "../../src/modules/auth/password.service.js";
import { storage } from "../../src/shared/storage/local-storage.js";
import { DocumentScanWorker } from "../../src/workers/document-scan-worker.js";
import { createSyntheticCase } from "../fixtures/cases.js";
import { resetTestDatabase, testPrisma } from "../helpers/database.js";

const ORIGIN = "http://localhost:3000"; const PASSWORD = "ClaveSegura123";
const allPermissions = ["cases.read", "documents.read", "documents.create", "documents.version", "documents.archive", "cases.archive"];
const pdf = (text: string) => Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n% ${text}\n%%EOF\n`);
async function cleanFiles() { const rows = await testPrisma.documentVersion.findMany({ select: { storageKey: true } }); await Promise.all(rows.map(({ storageKey }) => storage.delete(storageKey))); }
async function auth(codes = allPermissions, suffix = "full") { const items = await Promise.all(codes.map((code) => testPrisma.permission.upsert({ where: { code }, update: {}, create: { code, description: code } }))); const role = await testPrisma.role.create({ data: { code: `DOCS_${suffix.toUpperCase()}`, name: `Docs ${suffix}`, permissions: { create: items.map(({ id }) => ({ permissionId: id })) } } }); const user = await testPrisma.user.create({ data: { email: `docs-${suffix}@example.com`, emailNormalized: `docs-${suffix}@example.com`, name: `Docs ${suffix}`, passwordHash: await passwordService.hash(PASSWORD), roleId: role.id } }); const response = await request(buildApp()).post("/api/v1/auth/login").set("Origin", ORIGIN).send({ email: user.email, password: PASSWORD }); const cookies = response.headers["set-cookie"] as unknown as string[]; return { user, cookie: cookies[0]!.split(";")[0]!, csrf: response.body.data.csrfToken as string }; }
const headers = (value: { cookie: string; csrf: string }) => ({ Origin: ORIGIN, Cookie: value.cookie, "x-csrf-token": value.csrf });
beforeEach(async () => { await storage.ensureReady(); await cleanFiles(); await resetTestDatabase(); });
afterAll(async () => { await cleanFiles(); await testPrisma.$disconnect(); await disconnectDatabase(); });

describe("private documents and immutable versions", () => {
  it("streams a PDF, persists safe metadata and downloads the same bytes", async () => {
    const logged = await auth(); const legalCase = await createSyntheticCase(testPrisma, logged.user); const action = await testPrisma.caseAction.create({ data: { caseId: legalCase.id, title: "Presentación inicial", type: "FILING", documentAt: new Date("2026-01-02T12:00:00.000Z"), uploadedById: logged.user.id } }); const bytes = pdf("primera versión"); const app = buildApp();
    const uploaded = await request(app).post("/api/v1/documents").set(headers(logged)).field("title", "Demanda").field("category", "PLEADING").field("actionId", action.id).attach("file", bytes, { filename: "demanda.pdf", contentType: "application/pdf" });
    expect(uploaded.status).toBe(201); expect(uploaded.body.data).toMatchObject({ caseId: legalCase.id, actionId: action.id }); expect(uploaded.body.data.latestVersion).toMatchObject({ originalName: "demanda.pdf", mimeType: "application/pdf", sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), scanStatus: "SKIPPED" }); expect(JSON.stringify(uploaded.body)).not.toContain("storageKey");
    const stored = await testPrisma.documentVersion.findFirstOrThrow(); expect(await storage.exists(stored.storageKey)).toBe(true); expect(await storage.size(stored.storageKey)).toBe(bytes.length);
    const downloaded = await request(app).get(`/api/v1/documents/${uploaded.body.data.id}/download`).set("Cookie", logged.cookie).buffer(true);
    expect(downloaded.status).toBe(200); expect(downloaded.headers["content-type"]).toContain("application/pdf"); expect(downloaded.headers["content-disposition"]).toContain("demanda.pdf"); expect(Buffer.compare(downloaded.body as Buffer, bytes)).toBe(0);
    expect(await testPrisma.auditLog.count({ where: { action: "DOCUMENT_CREATED" } })).toBe(1); expect(await testPrisma.outboxEvent.count({ where: { type: "DOCUMENT_CREATED" } })).toBe(1);
  });

  it("adds concurrent immutable versions under a lock and lists them by case", async () => {
    const logged = await auth(); const legalCase = await createSyntheticCase(testPrisma, logged.user); const app = buildApp();
    const first = await request(app).post("/api/v1/documents").set(headers(logged)).field("title", "Resolución").field("caseId", legalCase.id).attach("file", pdf("v1"), { filename: "resolucion-v1.pdf", contentType: "application/pdf" });
    const second = await request(app).post(`/api/v1/documents/${first.body.data.id}/versions`).set(headers(logged)).attach("file", pdf("v2"), { filename: "resolucion-v2.pdf", contentType: "application/pdf" });
    expect(second.status).toBe(201); expect(second.body.data.versions.map((item: { versionNumber: number }) => item.versionNumber)).toEqual([2, 1]); expect(second.body.data.version).toBe(2);
    const concurrent = await Promise.all(["v3", "v4"].map((label) => request(app).post(`/api/v1/documents/${first.body.data.id}/versions`).set(headers(logged)).attach("file", pdf(label), { filename: `resolucion-${label}.pdf`, contentType: "application/pdf" })));
    expect(concurrent.every((response) => response.status === 201)).toBe(true);
    const list = await request(app).get(`/api/v1/documents?caseId=${legalCase.id}`).set("Cookie", logged.cookie); expect(list.status).toBe(200); expect(list.body.data).toHaveLength(1); expect(list.body.data[0].versions.map((item: { versionNumber: number }) => item.versionNumber)).toEqual([4, 3, 2, 1]); expect(await testPrisma.documentVersion.count()).toBe(4);
  });

  it("rejects forged MIME, corrupt and encrypted PDFs without metadata", async () => {
    const logged = await auth(); const legalCase = await createSyntheticCase(testPrisma, logged.user); const app = buildApp();
    const forged = await request(app).post("/api/v1/documents").set(headers(logged)).field("title", "Falso").field("caseId", legalCase.id).attach("file", pdf("mime"), { filename: "falso.pdf", contentType: "text/plain" }); expect(forged.status).toBe(400);
    const corrupt = await request(app).post("/api/v1/documents").set(headers(logged)).field("title", "Corrupto").field("caseId", legalCase.id).attach("file", Buffer.from("no es pdf"), { filename: "corrupto.pdf", contentType: "application/pdf" }); expect(corrupt.status).toBe(400);
    const encrypted = await request(app).post("/api/v1/documents").set(headers(logged)).field("title", "Cifrado").field("caseId", legalCase.id).attach("file", Buffer.from("%PDF-1.4\n/Encrypt 2 0 R\n%%EOF"), { filename: "cifrado.pdf", contentType: "application/pdf" }); expect(encrypted.status).toBe(400);
    expect(await testPrisma.document.count()).toBe(0); expect(await testPrisma.documentVersion.count()).toBe(0);
  });

  it("requires access to the related case and blocks unavailable scan states", async () => {
    const owner = await auth(allPermissions, "owner"); const legalCase = await createSyntheticCase(testPrisma, owner.user); const app = buildApp(); const uploaded = await request(app).post("/api/v1/documents").set(headers(owner)).field("title", "Privado").field("caseId", legalCase.id).attach("file", pdf("privado"), { filename: "privado.pdf", contentType: "application/pdf" });
    const reader = await auth(["documents.read"], "reader"); expect((await request(app).get(`/api/v1/documents/${uploaded.body.data.id}`).set("Cookie", reader.cookie)).status).toBe(403);
    const version = await testPrisma.documentVersion.findFirstOrThrow(); await testPrisma.documentVersion.update({ where: { id: version.id }, data: { scanStatus: "PENDING", scannedAt: null } }); expect((await request(app).get(`/api/v1/documents/${uploaded.body.data.id}/download`).set("Cookie", owner.cookie)).status).toBe(409);
    await testPrisma.documentVersion.update({ where: { id: version.id }, data: { scanStatus: "INFECTED", scannedAt: new Date() } }); expect((await request(app).get(`/api/v1/documents/${uploaded.body.data.id}/download`).set("Cookie", owner.cookie)).status).toBe(403);
  });

  it("enforces the configured byte limit during streaming and detects missing bytes", async () => {
    const logged = await auth(); const legalCase = await createSyntheticCase(testPrisma, logged.user); const app = buildApp(); const oversized = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(1024 * 1024, 65), Buffer.from("\n%%EOF")]);
    const rejected = await request(app).post("/api/v1/documents").set(headers(logged)).field("title", "Demasiado grande").field("caseId", legalCase.id).attach("file", oversized, { filename: "grande.pdf", contentType: "application/pdf" }); expect(rejected.status).toBe(413); expect(await testPrisma.document.count()).toBe(0);
    const uploaded = await request(app).post("/api/v1/documents").set(headers(logged)).field("title", "Luego ausente").field("caseId", legalCase.id).attach("file", pdf("ausente"), { filename: "ausente.pdf", contentType: "application/pdf" }); const version = await testPrisma.documentVersion.findFirstOrThrow(); await storage.delete(version.storageKey); expect((await request(app).get(`/api/v1/documents/${uploaded.body.data.id}/download`).set("Cookie", logged.cookie)).status).toBe(503);
  });

  it("keeps metadata when archived, rejects stale versions and never purges bytes", async () => {
    const logged = await auth(); const legalCase = await createSyntheticCase(testPrisma, logged.user); const app = buildApp(); const uploaded = await request(app).post("/api/v1/documents").set(headers(logged)).field("title", "Archivable").field("caseId", legalCase.id).attach("file", pdf("archivo"), { filename: "archivo.pdf", contentType: "application/pdf" }); const stored = await testPrisma.documentVersion.findFirstOrThrow();
    expect((await request(app).patch(`/api/v1/documents/${uploaded.body.data.id}`).set(headers(logged)).send({ version: 1, title: "Actualizado" })).status).toBe(200);
    expect((await request(app).delete(`/api/v1/documents/${uploaded.body.data.id}`).set(headers(logged)).send({ version: 1, reason: "Versión obsoleta" })).status).toBe(409);
    expect((await request(app).delete(`/api/v1/documents/${uploaded.body.data.id}`).set(headers(logged)).send({ version: 2, reason: "Versión obsoleta" })).status).toBe(204);
    expect(await testPrisma.document.count()).toBe(1); expect((await testPrisma.document.findFirstOrThrow()).deletedAt).not.toBeNull(); expect(await storage.exists(stored.storageKey)).toBe(true); expect((await request(app).get(`/api/v1/documents/${uploaded.body.data.id}`).set("Cookie", logged.cookie)).status).toBe(404);
  });

  it("processes antivirus outbox events and marks terminal failures", async () => {
    const logged = await auth(); const legalCase = await createSyntheticCase(testPrisma, logged.user); const uploaded = await request(buildApp()).post("/api/v1/documents").set(headers(logged)).field("title", "Para escanear").field("caseId", legalCase.id).attach("file", pdf("scan"), { filename: "scan.pdf", contentType: "application/pdf" }); const version = await testPrisma.documentVersion.findFirstOrThrow(); await testPrisma.documentVersion.update({ where: { id: version.id }, data: { scanStatus: "PENDING", scannedAt: null } });
    const cleanEvent = await testPrisma.outboxEvent.create({ data: { type: "DOCUMENT_SCAN_REQUESTED", aggregateType: "DocumentVersion", aggregateId: version.id, payload: { documentId: uploaded.body.data.id, versionId: version.id } } }); let scans = 0; const scanner = { scan: async () => { scans += 1; return "CLEAN" as const; } }; const claimed = await Promise.all([new DocumentScanWorker(testPrisma, scanner).runOnce(), new DocumentScanWorker(testPrisma, scanner).runOnce()]); expect(claimed.filter(Boolean)).toHaveLength(1); expect(scans).toBe(1); expect((await testPrisma.documentVersion.findUniqueOrThrow({ where: { id: version.id } })).scanStatus).toBe("CLEAN"); expect((await testPrisma.outboxEvent.findUniqueOrThrow({ where: { id: cleanEvent.id } })).status).toBe("PROCESSED");
    await testPrisma.documentVersion.update({ where: { id: version.id }, data: { scanStatus: "PENDING", scannedAt: null } }); const failedEvent = await testPrisma.outboxEvent.create({ data: { type: "DOCUMENT_SCAN_REQUESTED", aggregateType: "DocumentVersion", aggregateId: version.id, payload: { documentId: uploaded.body.data.id, versionId: version.id }, attempts: 4 } }); const failedWorker = new DocumentScanWorker(testPrisma, { scan: async () => { throw new Error("scanner offline"); } }); expect(await failedWorker.runOnce()).toBe(true); expect((await testPrisma.documentVersion.findUniqueOrThrow({ where: { id: version.id } })).scanStatus).toBe("FAILED"); expect((await testPrisma.outboxEvent.findUniqueOrThrow({ where: { id: failedEvent.id } })).status).toBe("FAILED");
  });
});
