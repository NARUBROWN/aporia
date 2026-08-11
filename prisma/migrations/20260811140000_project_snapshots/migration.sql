CREATE TABLE "project_snapshots" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "document" JSONB NOT NULL,
    "project_version" BIGINT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_snapshots_project_id_created_at_idx"
ON "project_snapshots"("project_id", "created_at" DESC);

ALTER TABLE "project_snapshots"
ADD CONSTRAINT "project_snapshots_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
