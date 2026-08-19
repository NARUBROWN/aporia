ALTER TABLE "snapshot_relations" ADD COLUMN "update_option" TEXT;
CREATE TABLE "snapshot_relation_links" (
  "id" UUID NOT NULL, "relation_id" UUID NOT NULL, "source_row_id" TEXT NOT NULL,
  "target_row_id" TEXT NOT NULL, "link_order" INTEGER NOT NULL,
  CONSTRAINT "snapshot_relation_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "snapshot_relation_links_relation_order_key" ON "snapshot_relation_links"("relation_id", "link_order");
ALTER TABLE "snapshot_relation_links" ADD CONSTRAINT "snapshot_relation_links_relation_id_fkey" FOREIGN KEY ("relation_id") REFERENCES "snapshot_relations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
