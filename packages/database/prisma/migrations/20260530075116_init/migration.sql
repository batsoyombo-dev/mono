-- CreateTable
CREATE TABLE "action_events" (
    "id" SERIAL NOT NULL,
    "actor_id" INTEGER NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "context" JSONB,
    "entity_snapshot" JSONB,
    "external_key" TEXT,
    "verb" VARCHAR(32) NOT NULL,
    "entity_type" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "action_event_id" INTEGER NOT NULL,
    "dedupe_key" TEXT,
    "template" TEXT,
    "payload" JSONB,
    "delivery_methods" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priority" VARCHAR(32) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "scheduled_for" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_recipients" (
    "id" SERIAL NOT NULL,
    "notification_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "read_at" TIMESTAMP(3),
    "recipient_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_results" (
    "id" SERIAL NOT NULL,
    "notification_id" INTEGER NOT NULL,
    "recipient_id" INTEGER,
    "delivery_method" VARCHAR(32) NOT NULL,
    "success" BOOLEAN NOT NULL,
    "delivery_id" TEXT,
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "delivered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "action_events_external_key_key" ON "action_events"("external_key");

-- CreateIndex
CREATE INDEX "action_events_entity_id_created_at_idx" ON "action_events"("entity_id", "created_at");

-- CreateIndex
CREATE INDEX "action_events_actor_id_created_at_idx" ON "action_events"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "action_events_verb_created_at_idx" ON "action_events"("verb", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

-- CreateIndex
CREATE INDEX "notifications_action_event_id_created_at_idx" ON "notifications"("action_event_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_status_scheduled_for_idx" ON "notifications"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "notification_recipients_notification_id_user_id_idx" ON "notification_recipients"("notification_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_recipients_notification_id_user_id_key" ON "notification_recipients"("notification_id", "user_id");

-- CreateIndex
CREATE INDEX "delivery_results_notification_id_delivery_method_idx" ON "delivery_results"("notification_id", "delivery_method");

-- CreateIndex
CREATE INDEX "delivery_results_success_delivered_at_idx" ON "delivery_results"("success", "delivered_at");

-- AddForeignKey
ALTER TABLE "action_events" ADD CONSTRAINT "action_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_action_event_id_fkey" FOREIGN KEY ("action_event_id") REFERENCES "action_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_results" ADD CONSTRAINT "delivery_results_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_results" ADD CONSTRAINT "delivery_results_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "notification_recipients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
