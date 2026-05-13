-- Add optional due date for tasks
ALTER TABLE "Task"
ADD COLUMN "dueDate" TIMESTAMP(3);
