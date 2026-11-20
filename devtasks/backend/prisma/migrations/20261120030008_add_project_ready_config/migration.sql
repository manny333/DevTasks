-- CreateTable
CREATE TABLE "ProjectReadyConfig" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "requireContext" BOOLEAN NOT NULL DEFAULT true,
    "requireAcceptanceCriteria" BOOLEAN NOT NULL DEFAULT true,
    "requireNoBlockers" BOOLEAN NOT NULL DEFAULT true,
    "requireDocument" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectReadyConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectReadyConfig_projectId_key" ON "ProjectReadyConfig"("projectId");

-- AddForeignKey
ALTER TABLE "ProjectReadyConfig" ADD CONSTRAINT "ProjectReadyConfig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectReadyConfig" ADD CONSTRAINT "ProjectReadyConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
