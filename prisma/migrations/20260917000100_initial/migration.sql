-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "ContactKind" AS ENUM ('PERSON', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "ContactCategoryType" AS ENUM ('CLIENT', 'LAWYER', 'COMPANY', 'REPRESENTATIVE', 'EXPERT', 'WITNESS', 'JUDICIAL_CONTACT', 'POLICE', 'OTHER');

-- CreateEnum
CREATE TYPE "ContactChannelType" AS ENUM ('EMAIL', 'PHONE', 'WHATSAPP', 'OTHER');

-- CreateEnum
CREATE TYPE "AddressType" AS ENUM ('HOME', 'WORK', 'LEGAL', 'OTHER');

-- CreateEnum
CREATE TYPE "CaseType" AS ENUM ('LABOR', 'CIVIL_COMMERCIAL', 'CRIMINAL', 'FAMILY', 'OTHER');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('CLIENT', 'CLAIMANT', 'DEFENDANT', 'THIRD_PARTY', 'COMPLAINANT', 'ACCUSED', 'VICTIM', 'EXPERT', 'WITNESS', 'OTHER');

-- CreateEnum
CREATE TYPE "PartySide" AS ENUM ('OUR_SIDE', 'COUNTERPART', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "RepresentationType" AS ENUM ('ATTORNEY', 'LEGAL_REPRESENTATIVE', 'POWER_OF_ATTORNEY', 'OTHER');

-- CreateEnum
CREATE TYPE "CaseTeamRole" AS ENUM ('PRIMARY', 'COLLABORATOR');

-- CreateEnum
CREATE TYPE "SubCaseType" AS ENUM ('EVIDENCE', 'INCIDENT');

-- CreateEnum
CREATE TYPE "SubCaseStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('CLAIM', 'ANSWER', 'NOTICE', 'DECREE', 'RESOLUTION', 'FILING', 'OFFICIAL_LETTER', 'NOTIFICATION', 'OTHER');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('PLEADING', 'COURT_ORDER', 'EVIDENCE', 'NOTICE', 'POWER_OF_ATTORNEY', 'IDENTITY', 'INTERNAL', 'OTHER');

-- CreateEnum
CREATE TYPE "MalwareScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "email_normalized" VARCHAR(320) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "avatar_url" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "role_id" UUID NOT NULL,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "password_changed_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "csrf_secret_hash" VARCHAR(64) NOT NULL,
    "ip_address" INET,
    "user_agent" TEXT,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "kind" "ContactKind" NOT NULL,
    "display_name" VARCHAR(240) NOT NULL,
    "display_name_normalized" VARCHAR(240) NOT NULL,
    "first_name" VARCHAR(120),
    "last_name" VARCHAR(120),
    "legal_name" VARCHAR(240),
    "document_number" VARCHAR(40),
    "document_number_normalized" VARCHAR(40),
    "tax_id" VARCHAR(40),
    "tax_id_normalized" VARCHAR(40),
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_categories" (
    "contact_id" UUID NOT NULL,
    "type" "ContactCategoryType" NOT NULL,

    CONSTRAINT "contact_categories_pkey" PRIMARY KEY ("contact_id","type")
);

-- CreateTable
CREATE TABLE "contact_channels" (
    "id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "type" "ContactChannelType" NOT NULL,
    "label" VARCHAR(80),
    "value" VARCHAR(320) NOT NULL,
    "value_normalized" VARCHAR(320) NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contact_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_addresses" (
    "id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "type" "AddressType" NOT NULL DEFAULT 'OTHER',
    "label" VARCHAR(80),
    "line1" VARCHAR(240) NOT NULL,
    "line2" VARCHAR(240),
    "city" VARCHAR(120),
    "province" VARCHAR(120),
    "postal_code" VARCHAR(30),
    "country" CHAR(2) NOT NULL DEFAULT 'AR',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contact_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courts" (
    "id" UUID NOT NULL,
    "name" VARCHAR(240) NOT NULL,
    "name_normalized" VARCHAR(240) NOT NULL,
    "jurisdiction" VARCHAR(160),
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "courts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "management_offices" (
    "id" UUID NOT NULL,
    "name" VARCHAR(240) NOT NULL,
    "name_normalized" VARCHAR(240) NOT NULL,
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "management_offices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "court_management_offices" (
    "court_id" UUID NOT NULL,
    "management_office_id" UUID NOT NULL,

    CONSTRAINT "court_management_offices_pkey" PRIMARY KEY ("court_id","management_office_id")
);

-- CreateTable
CREATE TABLE "legal_cases" (
    "id" UUID NOT NULL,
    "case_number" VARCHAR(100) NOT NULL,
    "case_number_normalized" VARCHAR(100) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "type" "CaseType" NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'PENDING',
    "start_date" DATE NOT NULL,
    "closed_on" DATE,
    "archived_on" DATE,
    "court_id" UUID,
    "management_office_id" UUID,
    "created_by_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "legal_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_participants" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "role" "ParticipantRole" NOT NULL,
    "side" "PartySide" NOT NULL DEFAULT 'NEUTRAL',
    "is_client" BOOLEAN NOT NULL DEFAULT false,
    "label" VARCHAR(120),
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active_from" DATE,
    "active_until" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "case_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_representations" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "represented_participant_id" UUID NOT NULL,
    "representative_contact_id" UUID NOT NULL,
    "type" "RepresentationType" NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "active_from" DATE,
    "active_until" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_representations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_team_members" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "CaseTeamRole" NOT NULL,
    "assigned_by_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassigned_at" TIMESTAMPTZ(3),

    CONSTRAINT "case_team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_status_history" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "from_status" "CaseStatus",
    "to_status" "CaseStatus" NOT NULL,
    "reason" TEXT,
    "changed_by_id" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_cases" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "type" "SubCaseType" NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "description" TEXT,
    "status" "SubCaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "opened_on" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_on" DATE,
    "created_by_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "sub_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_actions" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "sub_case_id" UUID,
    "title" VARCHAR(300) NOT NULL,
    "type" "ActionType" NOT NULL,
    "document_at" TIMESTAMPTZ(3) NOT NULL,
    "presentation_at" TIMESTAMPTZ(3),
    "registered_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaded_by_id" UUID NOT NULL,
    "presented_by_id" UUID,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "case_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "due_date" DATE,
    "completed_at" TIMESTAMPTZ(3),
    "case_id" UUID,
    "sub_case_id" UUID,
    "created_by_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_assignments" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "assigned_by_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassigned_at" TIMESTAMPTZ(3),

    CONSTRAINT "task_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_status_history" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "from_status" "TaskStatus",
    "to_status" "TaskStatus" NOT NULL,
    "reason" TEXT,
    "changed_by_id" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_comments" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "author_id" UUID NOT NULL,
    "case_id" UUID,
    "sub_case_id" UUID,
    "contact_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "category" "DocumentCategory" NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "case_id" UUID,
    "sub_case_id" UUID,
    "action_id" UUID,
    "task_id" UUID,
    "note_id" UUID,
    "created_by_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "storage_key" VARCHAR(512) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(160) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "scan_status" "MalwareScanStatus" NOT NULL DEFAULT 'PENDING',
    "scanned_at" TIMESTAMPTZ(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(120) NOT NULL,
    "entity_type" VARCHAR(80) NOT NULL,
    "entity_id" UUID,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "request_id" UUID,
    "ip_address" INET,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT,
    "entity_type" VARCHAR(80),
    "entity_id" UUID,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "task_assigned" BOOLEAN NOT NULL DEFAULT true,
    "task_due_soon" BOOLEAN NOT NULL DEFAULT true,
    "task_overdue" BOOLEAN NOT NULL DEFAULT true,
    "case_status_changed" BOOLEAN NOT NULL DEFAULT true,
    "email_enabled" BOOLEAN NOT NULL DEFAULT false,
    "due_soon_lead_days" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'OPEN',
    "submitted_by_id" UUID,
    "resolved_by_id" UUID,
    "resolution" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "type" VARCHAR(120) NOT NULL,
    "aggregate_type" VARCHAR(80),
    "aggregate_id" UUID,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMPTZ(3),
    "processed_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_normalized_key" ON "users"("email_normalized");

-- CreateIndex
CREATE INDEX "users_role_id_status_idx" ON "users"("role_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_expires_at_idx" ON "sessions"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_expires_at_idx" ON "password_reset_tokens"("user_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_document_number_normalized_key" ON "contacts"("document_number_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_tax_id_normalized_key" ON "contacts"("tax_id_normalized");

-- CreateIndex
CREATE INDEX "contacts_display_name_normalized_idx" ON "contacts"("display_name_normalized");

-- CreateIndex
CREATE INDEX "contacts_kind_deleted_at_idx" ON "contacts"("kind", "deleted_at");

-- CreateIndex
CREATE INDEX "contact_channels_value_normalized_idx" ON "contact_channels"("value_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "contact_channels_contact_id_type_value_normalized_key" ON "contact_channels"("contact_id", "type", "value_normalized");

-- CreateIndex
CREATE INDEX "contact_addresses_contact_id_is_primary_idx" ON "contact_addresses"("contact_id", "is_primary");

-- CreateIndex
CREATE INDEX "courts_name_normalized_idx" ON "courts"("name_normalized");

-- CreateIndex
CREATE INDEX "management_offices_name_normalized_idx" ON "management_offices"("name_normalized");

-- CreateIndex
CREATE INDEX "legal_cases_case_number_normalized_idx" ON "legal_cases"("case_number_normalized");

-- CreateIndex
CREATE INDEX "legal_cases_status_updated_at_idx" ON "legal_cases"("status", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "legal_cases_type_status_idx" ON "legal_cases"("type", "status");

-- CreateIndex
CREATE INDEX "legal_cases_court_id_idx" ON "legal_cases"("court_id");

-- CreateIndex
CREATE INDEX "legal_cases_management_office_id_idx" ON "legal_cases"("management_office_id");

-- CreateIndex
CREATE INDEX "case_participants_case_id_contact_id_active_until_idx" ON "case_participants"("case_id", "contact_id", "active_until");

-- CreateIndex
CREATE INDEX "case_participants_contact_id_idx" ON "case_participants"("contact_id");

-- CreateIndex
CREATE INDEX "case_participants_case_id_side_sort_order_idx" ON "case_participants"("case_id", "side", "sort_order");

-- CreateIndex
CREATE INDEX "case_representations_case_id_idx" ON "case_representations"("case_id");

-- CreateIndex
CREATE INDEX "case_representations_represented_participant_id_active_unti_idx" ON "case_representations"("represented_participant_id", "active_until");

-- CreateIndex
CREATE INDEX "case_representations_representative_contact_id_idx" ON "case_representations"("representative_contact_id");

-- CreateIndex
CREATE INDEX "case_team_members_case_id_role_unassigned_at_idx" ON "case_team_members"("case_id", "role", "unassigned_at");

-- CreateIndex
CREATE INDEX "case_team_members_user_id_unassigned_at_idx" ON "case_team_members"("user_id", "unassigned_at");

-- CreateIndex
CREATE INDEX "case_status_history_case_id_changed_at_idx" ON "case_status_history"("case_id", "changed_at" DESC);

-- CreateIndex
CREATE INDEX "sub_cases_case_id_type_status_idx" ON "sub_cases"("case_id", "type", "status");

-- CreateIndex
CREATE INDEX "case_actions_case_id_document_at_idx" ON "case_actions"("case_id", "document_at" DESC);

-- CreateIndex
CREATE INDEX "case_actions_sub_case_id_document_at_idx" ON "case_actions"("sub_case_id", "document_at" DESC);

-- CreateIndex
CREATE INDEX "case_actions_type_idx" ON "case_actions"("type");

-- CreateIndex
CREATE INDEX "tasks_status_due_date_idx" ON "tasks"("status", "due_date");

-- CreateIndex
CREATE INDEX "tasks_case_id_status_idx" ON "tasks"("case_id", "status");

-- CreateIndex
CREATE INDEX "tasks_sub_case_id_status_idx" ON "tasks"("sub_case_id", "status");

-- CreateIndex
CREATE INDEX "task_assignments_task_id_unassigned_at_idx" ON "task_assignments"("task_id", "unassigned_at");

-- CreateIndex
CREATE INDEX "task_assignments_user_id_unassigned_at_idx" ON "task_assignments"("user_id", "unassigned_at");

-- CreateIndex
CREATE INDEX "task_status_history_task_id_changed_at_idx" ON "task_status_history"("task_id", "changed_at" DESC);

-- CreateIndex
CREATE INDEX "task_comments_task_id_created_at_idx" ON "task_comments"("task_id", "created_at");

-- CreateIndex
CREATE INDEX "notes_case_id_created_at_idx" ON "notes"("case_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notes_sub_case_id_created_at_idx" ON "notes"("sub_case_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notes_contact_id_created_at_idx" ON "notes"("contact_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "documents_case_id_created_at_idx" ON "documents"("case_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "documents_sub_case_id_idx" ON "documents"("sub_case_id");

-- CreateIndex
CREATE INDEX "documents_action_id_idx" ON "documents"("action_id");

-- CreateIndex
CREATE INDEX "documents_task_id_idx" ON "documents"("task_id");

-- CreateIndex
CREATE INDEX "documents_note_id_idx" ON "documents"("note_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_storage_key_key" ON "document_versions"("storage_key");

-- CreateIndex
CREATE INDEX "document_versions_document_id_created_at_idx" ON "document_versions"("document_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "document_versions_sha256_idx" ON "document_versions"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_document_id_version_number_key" ON "document_versions"("document_id", "version_number");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_request_id_idx" ON "audit_logs"("request_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_key" ON "notification_preferences"("user_id");

-- CreateIndex
CREATE INDEX "feedback_status_created_at_idx" ON "feedback"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "outbox_events_status_available_at_idx" ON "outbox_events"("status", "available_at");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_categories" ADD CONSTRAINT "contact_categories_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_channels" ADD CONSTRAINT "contact_channels_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_addresses" ADD CONSTRAINT "contact_addresses_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_management_offices" ADD CONSTRAINT "court_management_offices_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_management_offices" ADD CONSTRAINT "court_management_offices_management_office_id_fkey" FOREIGN KEY ("management_office_id") REFERENCES "management_offices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_cases" ADD CONSTRAINT "legal_cases_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_cases" ADD CONSTRAINT "legal_cases_management_office_id_fkey" FOREIGN KEY ("management_office_id") REFERENCES "management_offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_cases" ADD CONSTRAINT "legal_cases_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_participants" ADD CONSTRAINT "case_participants_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "legal_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_participants" ADD CONSTRAINT "case_participants_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_representations" ADD CONSTRAINT "case_representations_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "legal_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_representations" ADD CONSTRAINT "case_representations_represented_participant_id_fkey" FOREIGN KEY ("represented_participant_id") REFERENCES "case_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_representations" ADD CONSTRAINT "case_representations_representative_contact_id_fkey" FOREIGN KEY ("representative_contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_team_members" ADD CONSTRAINT "case_team_members_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "legal_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_team_members" ADD CONSTRAINT "case_team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_team_members" ADD CONSTRAINT "case_team_members_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_status_history" ADD CONSTRAINT "case_status_history_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "legal_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_status_history" ADD CONSTRAINT "case_status_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_cases" ADD CONSTRAINT "sub_cases_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "legal_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_cases" ADD CONSTRAINT "sub_cases_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_actions" ADD CONSTRAINT "case_actions_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "legal_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_actions" ADD CONSTRAINT "case_actions_sub_case_id_fkey" FOREIGN KEY ("sub_case_id") REFERENCES "sub_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_actions" ADD CONSTRAINT "case_actions_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_actions" ADD CONSTRAINT "case_actions_presented_by_id_fkey" FOREIGN KEY ("presented_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "legal_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_sub_case_id_fkey" FOREIGN KEY ("sub_case_id") REFERENCES "sub_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_status_history" ADD CONSTRAINT "task_status_history_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_status_history" ADD CONSTRAINT "task_status_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "legal_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_sub_case_id_fkey" FOREIGN KEY ("sub_case_id") REFERENCES "sub_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "legal_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_sub_case_id_fkey" FOREIGN KEY ("sub_case_id") REFERENCES "sub_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "case_actions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Domain checks and partial indexes intentionally maintained as SQL because
-- Prisma cannot express them in the schema DSL. Keep them covered by
-- integration tests whenever this migration changes.

-- Identity and authentication invariants
ALTER TABLE "roles"
  ADD CONSTRAINT "roles_code_format_check"
  CHECK ("code" ~ '^[A-Z][A-Z0-9_]*$');

ALTER TABLE "permissions"
  ADD CONSTRAINT "permissions_code_format_check"
  CHECK ("code" ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$');

ALTER TABLE "users"
  ADD CONSTRAINT "users_email_normalized_check"
  CHECK ("email_normalized" = lower(btrim("email_normalized")) AND length("email_normalized") > 3),
  ADD CONSTRAINT "users_failed_login_count_check"
  CHECK ("failed_login_count" >= 0),
  ADD CONSTRAINT "users_version_check"
  CHECK ("version" > 0);

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_token_hash_check"
  CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "sessions_csrf_secret_hash_check"
  CHECK ("csrf_secret_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "sessions_expiration_check"
  CHECK ("expires_at" > "created_at"),
  ADD CONSTRAINT "sessions_last_seen_check"
  CHECK ("last_seen_at" >= "created_at");

ALTER TABLE "password_reset_tokens"
  ADD CONSTRAINT "password_reset_tokens_hash_check"
  CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "password_reset_tokens_expiration_check"
  CHECK ("expires_at" > "created_at"),
  ADD CONSTRAINT "password_reset_tokens_used_at_check"
  CHECK ("used_at" IS NULL OR "used_at" >= "created_at");

-- Contacts and catalogs
ALTER TABLE "contacts"
  ADD CONSTRAINT "contacts_kind_fields_check"
  CHECK (
    ("kind" = 'PERSON' AND "first_name" IS NOT NULL AND btrim("first_name") <> '')
    OR
    ("kind" = 'ORGANIZATION' AND "legal_name" IS NOT NULL AND btrim("legal_name") <> '')
  ),
  ADD CONSTRAINT "contacts_display_name_check"
  CHECK (btrim("display_name") <> '' AND btrim("display_name_normalized") <> ''),
  ADD CONSTRAINT "contacts_version_check"
  CHECK ("version" > 0),
  ADD CONSTRAINT "contacts_deleted_at_check"
  CHECK ("deleted_at" IS NULL OR "deleted_at" >= "created_at");

ALTER TABLE "contact_channels"
  ADD CONSTRAINT "contact_channels_value_check"
  CHECK (btrim("value") <> '' AND btrim("value_normalized") <> ''),
  ADD CONSTRAINT "contact_channels_sort_order_check"
  CHECK ("sort_order" >= 0);

CREATE UNIQUE INDEX "contact_channels_one_primary_per_type_key"
  ON "contact_channels" ("contact_id", "type")
  WHERE "is_primary" = true;

ALTER TABLE "contact_addresses"
  ADD CONSTRAINT "contact_addresses_country_check"
  CHECK ("country" ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT "contact_addresses_line1_check"
  CHECK (btrim("line1") <> '');

CREATE UNIQUE INDEX "contact_addresses_one_primary_per_type_key"
  ON "contact_addresses" ("contact_id", "type")
  WHERE "is_primary" = true;

ALTER TABLE "courts"
  ADD CONSTRAINT "courts_name_check"
  CHECK (btrim("name") <> '' AND btrim("name_normalized") <> '');

ALTER TABLE "management_offices"
  ADD CONSTRAINT "management_offices_name_check"
  CHECK (btrim("name") <> '' AND btrim("name_normalized") <> '');

-- Legal cases, participants and internal team
ALTER TABLE "legal_cases"
  ADD CONSTRAINT "legal_cases_number_check"
  CHECK (btrim("case_number") <> '' AND btrim("case_number_normalized") <> ''),
  ADD CONSTRAINT "legal_cases_title_check"
  CHECK (btrim("title") <> ''),
  ADD CONSTRAINT "legal_cases_version_check"
  CHECK ("version" > 0),
  ADD CONSTRAINT "legal_cases_status_dates_check"
  CHECK (
    ("status" IN ('PENDING', 'ACTIVE', 'SUSPENDED') AND "closed_on" IS NULL AND "archived_on" IS NULL)
    OR
    ("status" = 'CLOSED' AND "closed_on" IS NOT NULL AND "archived_on" IS NULL)
    OR
    ("status" = 'ARCHIVED' AND "closed_on" IS NOT NULL AND "archived_on" IS NOT NULL)
  ),
  ADD CONSTRAINT "legal_cases_date_order_check"
  CHECK (
    ("closed_on" IS NULL OR "closed_on" >= "start_date")
    AND ("archived_on" IS NULL OR "archived_on" >= "closed_on")
  ),
  ADD CONSTRAINT "legal_cases_deleted_at_check"
  CHECK ("deleted_at" IS NULL OR "deleted_at" >= "created_at");

CREATE UNIQUE INDEX "legal_cases_court_number_active_key"
  ON "legal_cases" ("court_id", "case_number_normalized")
  WHERE "deleted_at" IS NULL AND "court_id" IS NOT NULL;

CREATE UNIQUE INDEX "legal_cases_without_court_number_active_key"
  ON "legal_cases" ("case_number_normalized")
  WHERE "deleted_at" IS NULL AND "court_id" IS NULL;

ALTER TABLE "case_participants"
  ADD CONSTRAINT "case_participants_other_label_check"
  CHECK ("role" <> 'OTHER' OR ("label" IS NOT NULL AND btrim("label") <> '')),
  ADD CONSTRAINT "case_participants_sort_order_check"
  CHECK ("sort_order" >= 0),
  ADD CONSTRAINT "case_participants_active_dates_check"
  CHECK ("active_until" IS NULL OR "active_from" IS NULL OR "active_until" >= "active_from"),
  ADD CONSTRAINT "case_participants_id_case_id_key" UNIQUE ("id", "case_id");

CREATE UNIQUE INDEX "case_participants_active_role_key"
  ON "case_participants" ("case_id", "contact_id", "role")
  WHERE "active_until" IS NULL;

ALTER TABLE "case_representations"
  ADD CONSTRAINT "case_representations_active_dates_check"
  CHECK ("active_until" IS NULL OR "active_from" IS NULL OR "active_until" >= "active_from"),
  ADD CONSTRAINT "case_representations_participant_case_fkey"
  FOREIGN KEY ("represented_participant_id", "case_id")
  REFERENCES "case_participants" ("id", "case_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "case_representations_active_key"
  ON "case_representations" ("represented_participant_id", "representative_contact_id", "type")
  WHERE "active_until" IS NULL;

CREATE UNIQUE INDEX "case_representations_one_active_primary_key"
  ON "case_representations" ("represented_participant_id")
  WHERE "is_primary" = true AND "active_until" IS NULL;

ALTER TABLE "case_team_members"
  ADD CONSTRAINT "case_team_members_assignment_dates_check"
  CHECK ("unassigned_at" IS NULL OR "unassigned_at" >= "assigned_at");

CREATE UNIQUE INDEX "case_team_members_active_user_key"
  ON "case_team_members" ("case_id", "user_id")
  WHERE "unassigned_at" IS NULL;

CREATE UNIQUE INDEX "case_team_members_one_active_primary_key"
  ON "case_team_members" ("case_id")
  WHERE "role" = 'PRIMARY' AND "unassigned_at" IS NULL;

-- Sub-cases and actions
ALTER TABLE "sub_cases"
  ADD CONSTRAINT "sub_cases_title_check"
  CHECK (btrim("title") <> ''),
  ADD CONSTRAINT "sub_cases_version_check"
  CHECK ("version" > 0),
  ADD CONSTRAINT "sub_cases_status_dates_check"
  CHECK (
    ("status" IN ('ACTIVE', 'RESOLVED') AND "closed_on" IS NULL)
    OR ("status" = 'CLOSED' AND "closed_on" IS NOT NULL)
  ),
  ADD CONSTRAINT "sub_cases_date_order_check"
  CHECK ("closed_on" IS NULL OR "closed_on" >= "opened_on"),
  ADD CONSTRAINT "sub_cases_deleted_at_check"
  CHECK ("deleted_at" IS NULL OR "deleted_at" >= "created_at"),
  ADD CONSTRAINT "sub_cases_id_case_id_key" UNIQUE ("id", "case_id");

ALTER TABLE "case_actions"
  ADD CONSTRAINT "case_actions_title_check"
  CHECK (btrim("title") <> ''),
  ADD CONSTRAINT "case_actions_version_check"
  CHECK ("version" > 0),
  ADD CONSTRAINT "case_actions_deleted_at_check"
  CHECK ("deleted_at" IS NULL OR "deleted_at" >= "created_at"),
  ADD CONSTRAINT "case_actions_sub_case_case_fkey"
  FOREIGN KEY ("sub_case_id", "case_id")
  REFERENCES "sub_cases" ("id", "case_id")
  ON DELETE SET NULL ("sub_case_id") ON UPDATE CASCADE;

-- Tasks, comments and notes
ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_title_check"
  CHECK (btrim("title") <> ''),
  ADD CONSTRAINT "tasks_version_check"
  CHECK ("version" > 0),
  ADD CONSTRAINT "tasks_completed_at_check"
  CHECK (
    ("status" = 'COMPLETED' AND "completed_at" IS NOT NULL)
    OR ("status" <> 'COMPLETED' AND "completed_at" IS NULL)
  ),
  ADD CONSTRAINT "tasks_sub_case_requires_case_check"
  CHECK ("sub_case_id" IS NULL OR "case_id" IS NOT NULL),
  ADD CONSTRAINT "tasks_deleted_at_check"
  CHECK ("deleted_at" IS NULL OR "deleted_at" >= "created_at"),
  ADD CONSTRAINT "tasks_sub_case_case_fkey"
  FOREIGN KEY ("sub_case_id", "case_id")
  REFERENCES "sub_cases" ("id", "case_id")
  ON DELETE SET NULL ("sub_case_id") ON UPDATE CASCADE;

ALTER TABLE "task_assignments"
  ADD CONSTRAINT "task_assignments_dates_check"
  CHECK ("unassigned_at" IS NULL OR "unassigned_at" >= "assigned_at");

CREATE UNIQUE INDEX "task_assignments_active_user_key"
  ON "task_assignments" ("task_id", "user_id")
  WHERE "unassigned_at" IS NULL;

ALTER TABLE "task_comments"
  ADD CONSTRAINT "task_comments_content_check"
  CHECK (btrim("content") <> ''),
  ADD CONSTRAINT "task_comments_version_check"
  CHECK ("version" > 0),
  ADD CONSTRAINT "task_comments_deleted_at_check"
  CHECK ("deleted_at" IS NULL OR "deleted_at" >= "created_at");

ALTER TABLE "notes"
  ADD CONSTRAINT "notes_content_check"
  CHECK (btrim("content") <> ''),
  ADD CONSTRAINT "notes_context_check"
  CHECK (num_nonnulls("case_id", "sub_case_id", "contact_id") >= 1),
  ADD CONSTRAINT "notes_version_check"
  CHECK ("version" > 0),
  ADD CONSTRAINT "notes_deleted_at_check"
  CHECK ("deleted_at" IS NULL OR "deleted_at" >= "created_at");

-- Documents and immutable PDF versions
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_title_check"
  CHECK (btrim("title") <> ''),
  ADD CONSTRAINT "documents_context_check"
  CHECK (num_nonnulls("case_id", "sub_case_id", "action_id", "task_id", "note_id") >= 1),
  ADD CONSTRAINT "documents_version_check"
  CHECK ("version" > 0),
  ADD CONSTRAINT "documents_deleted_at_check"
  CHECK ("deleted_at" IS NULL OR "deleted_at" >= "created_at");

ALTER TABLE "document_versions"
  ADD CONSTRAINT "document_versions_number_check"
  CHECK ("version_number" > 0),
  ADD CONSTRAINT "document_versions_pdf_mime_check"
  CHECK (lower("mime_type") = 'application/pdf'),
  ADD CONSTRAINT "document_versions_size_check"
  CHECK ("size_bytes" > 0 AND "size_bytes" <= 52428800),
  ADD CONSTRAINT "document_versions_sha256_check"
  CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "document_versions_storage_key_check"
  CHECK (
    btrim("storage_key") <> ''
    AND "storage_key" !~ '(^/|\\|(^|/)\.\.(/|$))'
  ),
  ADD CONSTRAINT "document_versions_scan_time_check"
  CHECK (
    ("scan_status" = 'PENDING' AND "scanned_at" IS NULL)
    OR ("scan_status" <> 'PENDING' AND "scanned_at" IS NOT NULL)
  );

-- Platform records
ALTER TABLE "notification_preferences"
  ADD CONSTRAINT "notification_preferences_due_soon_check"
  CHECK ("due_soon_lead_days" BETWEEN 0 AND 365);

ALTER TABLE "feedback"
  ADD CONSTRAINT "feedback_message_check"
  CHECK (btrim("message") <> ''),
  ADD CONSTRAINT "feedback_resolution_state_check"
  CHECK (
    ("status" IN ('OPEN', 'IN_REVIEW') AND "resolved_at" IS NULL)
    OR ("status" IN ('RESOLVED', 'REJECTED') AND "resolved_at" IS NOT NULL)
  );

ALTER TABLE "outbox_events"
  ADD CONSTRAINT "outbox_events_type_check"
  CHECK (btrim("type") <> ''),
  ADD CONSTRAINT "outbox_events_attempts_check"
  CHECK ("attempts" >= 0),
  ADD CONSTRAINT "outbox_events_status_fields_check"
  CHECK (
    ("status" = 'PENDING' AND "processed_at" IS NULL)
    OR ("status" = 'PROCESSING' AND "locked_at" IS NOT NULL AND "processed_at" IS NULL)
    OR ("status" = 'PROCESSED' AND "processed_at" IS NOT NULL)
    OR ("status" = 'FAILED' AND "last_error" IS NOT NULL)
  );
