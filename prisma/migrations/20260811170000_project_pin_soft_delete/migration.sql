ALTER TABLE "projects"
ADD COLUMN "password_hash" TEXT,
ADD COLUMN "deleted_at" TIMESTAMPTZ(6);

CREATE INDEX "projects_deleted_at_idx" ON "projects"("deleted_at");
