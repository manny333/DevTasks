-- CreateTable
CREATE TABLE "ProjectProfile" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "purpose" TEXT,
    "repoUrl" TEXT,
    "defaultBranch" TEXT,
    "stack" TEXT,
    "setupCommands" TEXT,
    "runCommands" TEXT,
    "testCommands" TEXT,
    "deployUrl" TEXT,
    "stagingUrl" TEXT,
    "owners" TEXT,
    "onCall" TEXT,
    "startHere" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectProfile_projectId_key" ON "ProjectProfile"("projectId");

-- AddForeignKey
ALTER TABLE "ProjectProfile" ADD CONSTRAINT "ProjectProfile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectProfile" ADD CONSTRAINT "ProjectProfile_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
