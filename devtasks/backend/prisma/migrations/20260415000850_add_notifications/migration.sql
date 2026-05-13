-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('COMMENT_ADDED', 'TASK_ASSIGNED', 'TASK_UNASSIGNED', 'TASK_STATUS_CHANGED');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "taskId" TEXT,
    "taskTitle" TEXT,
    "projectId" TEXT,
    "projectName" TEXT,
    "meta" JSONB,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
