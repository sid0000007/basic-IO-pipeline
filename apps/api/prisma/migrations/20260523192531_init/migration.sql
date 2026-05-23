-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('active', 'completed', 'cancelled', 'archived');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('system', 'user', 'assistant', 'tool');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('completed', 'streaming', 'cancelled', 'failed');

-- CreateEnum
CREATE TYPE "InferenceStatus" AS ENUM ('queued', 'started', 'streaming', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "InferenceEventType" AS ENUM ('request_started', 'first_token', 'stream_delta', 'request_completed', 'request_failed', 'request_cancelled');

-- CreateEnum
CREATE TYPE "IngestionStatus" AS ENUM ('received', 'validated', 'processed', 'failed');

-- CreateEnum
CREATE TYPE "QueueJobStatus" AS ENUM ('queued', 'running', 'completed', 'failed', 'dead_letter');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "title" TEXT NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'active',
    "last_message_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "content_preview" TEXT,
    "sequence_number" INTEGER NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'completed',
    "provider_message_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inference_requests" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "user_message_id" UUID,
    "assistant_message_id" UUID,
    "session_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "InferenceStatus" NOT NULL DEFAULT 'queued',
    "request_started_at" TIMESTAMPTZ NOT NULL,
    "first_token_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "latency_ms" INTEGER,
    "time_to_first_token_ms" INTEGER,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "total_tokens" INTEGER,
    "input_preview" TEXT,
    "output_preview" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "request_metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "inference_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inference_events" (
    "id" UUID NOT NULL,
    "inference_request_id" UUID,
    "event_type" "InferenceEventType" NOT NULL,
    "event_timestamp" TIMESTAMPTZ NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inference_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_logs" (
    "id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "source_event_id" TEXT,
    "request_id" TEXT,
    "status" "IngestionStatus" NOT NULL DEFAULT 'received',
    "payload_version" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ NOT NULL,
    "processed_at" TIMESTAMPTZ,
    "error_message" TEXT,
    "raw_payload" JSONB NOT NULL,
    "normalized_payload" JSONB,

    CONSTRAINT "ingestion_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queue_jobs" (
    "id" UUID NOT NULL,
    "job_type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "status" "QueueJobStatus" NOT NULL DEFAULT 'queued',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "available_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "queue_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_configs" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "default_model" TEXT NOT NULL,
    "timeout_ms" INTEGER NOT NULL,
    "settings" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "conversations_user_id_updated_at_idx" ON "conversations"("user_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "conversations_status_updated_at_idx" ON "conversations"("status", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "messages_conversation_id_sequence_number_key" ON "messages"("conversation_id", "sequence_number");

-- CreateIndex
CREATE INDEX "inference_requests_conversation_id_created_at_idx" ON "inference_requests"("conversation_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "inference_requests_provider_model_created_at_idx" ON "inference_requests"("provider", "model", "created_at" DESC);

-- CreateIndex
CREATE INDEX "inference_requests_status_created_at_idx" ON "inference_requests"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "inference_requests_session_id_idx" ON "inference_requests"("session_id");

-- CreateIndex
CREATE INDEX "inference_requests_request_started_at_idx" ON "inference_requests"("request_started_at" DESC);

-- CreateIndex
CREATE INDEX "inference_events_inference_request_id_event_timestamp_idx" ON "inference_events"("inference_request_id", "event_timestamp");

-- CreateIndex
CREATE INDEX "inference_events_event_type_event_timestamp_idx" ON "inference_events"("event_type", "event_timestamp" DESC);

-- CreateIndex
CREATE INDEX "ingestion_logs_status_received_at_idx" ON "ingestion_logs"("status", "received_at" DESC);

-- CreateIndex
CREATE INDEX "ingestion_logs_source_received_at_idx" ON "ingestion_logs"("source", "received_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ingestion_logs_source_source_event_id_key" ON "ingestion_logs"("source", "source_event_id");

-- CreateIndex
CREATE INDEX "queue_jobs_status_available_at_idx" ON "queue_jobs"("status", "available_at");

-- CreateIndex
CREATE INDEX "queue_jobs_job_type_status_idx" ON "queue_jobs"("job_type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "provider_configs_provider_key" ON "provider_configs"("provider");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inference_requests" ADD CONSTRAINT "inference_requests_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inference_requests" ADD CONSTRAINT "inference_requests_user_message_id_fkey" FOREIGN KEY ("user_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inference_requests" ADD CONSTRAINT "inference_requests_assistant_message_id_fkey" FOREIGN KEY ("assistant_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inference_events" ADD CONSTRAINT "inference_events_inference_request_id_fkey" FOREIGN KEY ("inference_request_id") REFERENCES "inference_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
