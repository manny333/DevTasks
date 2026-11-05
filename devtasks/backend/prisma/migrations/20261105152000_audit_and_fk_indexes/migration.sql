-- Audit trail survives task deletion
ALTER TABLE "ActivityLog" DROP CONSTRAINT "ActivityLog_taskId_fkey";
ALTER TABLE "ActivityLog" ALTER COLUMN "taskId" DROP NOT NULL;
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Foreign-key indexes (PostgreSQL does not create them automatically)
CREATE INDEX "Task_sectionId_idx" ON "Task"("sectionId");
CREATE INDEX "Comment_taskId_idx" ON "Comment"("taskId");
CREATE INDEX "TaskAttachment_taskId_idx" ON "TaskAttachment"("taskId");
CREATE INDEX "TaskAssignee_userId_idx" ON "TaskAssignee"("userId");
CREATE INDEX "SectionMember_userId_idx" ON "SectionMember"("userId");
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");
CREATE INDEX "Tag_projectId_idx" ON "Tag"("projectId");
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");
CREATE INDEX "TaskTemplate_projectId_idx" ON "TaskTemplate"("projectId");
CREATE INDEX "ActivityLog_actorId_idx" ON "ActivityLog"("actorId");
