-- Hot paths: owned project lists, ordered sheet metadata and relation loading.
-- These indexes are additive and do not rewrite or delete application rows.
CREATE INDEX "projects_owner_id_deleted_at_updated_at_idx"
ON "projects"("owner_id", "deleted_at", "updated_at" DESC);

CREATE INDEX "project_sheets_project_id_display_order_created_at_idx"
ON "project_sheets"("project_id", "display_order", "created_at");

CREATE INDEX "sheet_relations_source_sheet_id_created_at_idx"
ON "sheet_relations"("source_sheet_id", "created_at");

DROP INDEX IF EXISTS "project_sheets_project_id_display_order_idx";
DROP INDEX IF EXISTS "sheet_relations_source_sheet_id_idx";
