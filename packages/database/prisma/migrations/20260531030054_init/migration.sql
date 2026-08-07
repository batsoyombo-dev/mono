/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Existing users receive a reserved, non-deliverable placeholder email. They must update it before email delivery is enabled.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN "email" VARCHAR(128);

UPDATE "User"
SET "email" = CONCAT('legacy-', "id", '@example.invalid')
WHERE "email" IS NULL;

ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AlterTable
ALTER TABLE "User" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "ActionEvent" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "Notification" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "NotificationRecipient" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "User_deleted_at_idx" ON "User"("deleted_at");
CREATE INDEX "ActionEvent_deleted_at_idx" ON "ActionEvent"("deleted_at");
CREATE INDEX "Notification_deleted_at_idx" ON "Notification"("deleted_at");
CREATE INDEX "NotificationRecipient_deleted_at_idx" ON "NotificationRecipient"("deleted_at");
