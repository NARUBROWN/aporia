ALTER TABLE "snapshot_relations" ADD COLUMN "display_order" INTEGER NOT NULL DEFAULT 0;

DROP INDEX "snapshot_relations_snapshot_id_idx";
CREATE INDEX "snapshot_relations_snapshot_id_display_order_idx" ON "snapshot_relations"("snapshot_id", "display_order");
