-- CreateEnum
CREATE TYPE "AccessType" AS ENUM ('FULL', 'EDITOR', 'VIEWER');

-- AlterTable
ALTER TABLE "ProjectMember" ADD COLUMN     "accessType" "AccessType" NOT NULL DEFAULT 'FULL';

-- CreateTable
CREATE TABLE "SectionMember" (
    "id" TEXT NOT NULL,
    "accessType" "AccessType" NOT NULL DEFAULT 'VIEWER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "SectionMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAssignee" (
    "accessType" "AccessType" NOT NULL DEFAULT 'VIEWER',
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TaskAssignee_pkey" PRIMARY KEY ("taskId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "SectionMember_sectionId_userId_key" ON "SectionMember"("sectionId", "userId");

-- AddForeignKey
ALTER TABLE "SectionMember" ADD CONSTRAINT "SectionMember_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionMember" ADD CONSTRAINT "SectionMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
