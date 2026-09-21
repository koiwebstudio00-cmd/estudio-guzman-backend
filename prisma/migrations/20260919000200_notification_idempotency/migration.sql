ALTER TABLE "notifications" ADD COLUMN "dedupe_key" VARCHAR(200);
UPDATE "notifications" SET "dedupe_key" = 'legacy:' || "id"::text WHERE "dedupe_key" IS NULL;
ALTER TABLE "notifications" ALTER COLUMN "dedupe_key" SET NOT NULL;
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

ALTER TABLE "outbox_events" ADD COLUMN "dedupe_key" VARCHAR(200);
CREATE UNIQUE INDEX "outbox_events_dedupe_key_key" ON "outbox_events"("dedupe_key");
