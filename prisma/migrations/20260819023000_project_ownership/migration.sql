ALTER TABLE "projects" ADD COLUMN "owner_id" UUID;

CREATE INDEX "projects_owner_id_idx" ON "projects"("owner_id");

ALTER TABLE "projects"
ADD CONSTRAINT "projects_owner_id_fkey"
FOREIGN KEY ("owner_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
