-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "acceptanceCriteria" TEXT,
ADD COLUMN     "branch" TEXT,
ADD COLUMN     "context" TEXT,
ADD COLUMN     "outOfScope" TEXT,
ADD COLUMN     "prUrl" TEXT,
ADD COLUMN     "repoUrl" TEXT,
ADD COLUMN     "technicalNotes" TEXT;

-- CreateTable
CREATE TABLE "TaskDocument" (
    "taskId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskDocument_pkey" PRIMARY KEY ("taskId","documentId")
);

-- CreateIndex
CREATE INDEX "TaskDocument_documentId_idx" ON "TaskDocument"("documentId");

-- AddForeignKey
ALTER TABLE "TaskDocument" ADD CONSTRAINT "TaskDocument_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDocument" ADD CONSTRAINT "TaskDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ProjectDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
