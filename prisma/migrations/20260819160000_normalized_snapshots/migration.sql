CREATE TABLE "snapshot_sheets" (
  "id" UUID NOT NULL, "snapshot_id" TEXT NOT NULL, "original_sheet_id" TEXT NOT NULL,
  "name" TEXT NOT NULL, "color" TEXT, "comment" TEXT, "display_order" INTEGER NOT NULL,
  CONSTRAINT "snapshot_sheets_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "snapshot_columns" (
  "id" UUID NOT NULL, "snapshot_sheet_id" UUID NOT NULL, "name" TEXT NOT NULL,
  "data_type" TEXT NOT NULL, "color" TEXT, "comment" TEXT, "display_order" INTEGER NOT NULL,
  CONSTRAINT "snapshot_columns_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "snapshot_rows" (
  "id" UUID NOT NULL, "snapshot_sheet_id" UUID NOT NULL, "original_row_id" TEXT NOT NULL,
  "row_order" INTEGER NOT NULL, CONSTRAINT "snapshot_rows_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "snapshot_cells" (
  "row_id" UUID NOT NULL, "column_id" UUID NOT NULL, "value" TEXT,
  CONSTRAINT "snapshot_cells_pkey" PRIMARY KEY ("row_id", "column_id")
);
CREATE TABLE "snapshot_relations" (
  "id" UUID NOT NULL, "snapshot_id" TEXT NOT NULL, "original_relation_id" TEXT NOT NULL,
  "source_sheet_original_id" TEXT NOT NULL, "source_column" TEXT NOT NULL,
  "target_sheet_original_id" TEXT NOT NULL, "target_column" TEXT NOT NULL,
  "relation_type" TEXT NOT NULL, "relation_origin" TEXT NOT NULL DEFAULT 'manual',
  CONSTRAINT "snapshot_relations_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "snapshot_calculated_fields" (
  "id" UUID NOT NULL, "snapshot_id" TEXT NOT NULL, "original_field_id" TEXT NOT NULL,
  "result_sheet_original_id" TEXT NOT NULL, "name" TEXT NOT NULL, "field_type" TEXT NOT NULL,
  "color" TEXT, "display_order" INTEGER NOT NULL,
  CONSTRAINT "snapshot_calculated_fields_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "snapshot_calculation_rules" (
  "id" UUID NOT NULL, "snapshot_calculated_field_id" UUID NOT NULL, "step_order" INTEGER NOT NULL,
  "operation" TEXT NOT NULL, "arguments" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "snapshot_calculation_rules_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "snapshot_calculation_conditions" (
  "id" UUID NOT NULL, "snapshot_calculated_field_id" UUID NOT NULL, "condition_order" INTEGER NOT NULL,
  "source_sheet_original_id" TEXT, "source_column" TEXT, "operator" TEXT NOT NULL,
  "operand_type" TEXT NOT NULL, "operand_value" TEXT,
  CONSTRAINT "snapshot_calculation_conditions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "snapshot_sheets_snapshot_id_original_sheet_id_key" ON "snapshot_sheets"("snapshot_id", "original_sheet_id");
CREATE INDEX "snapshot_sheets_snapshot_id_display_order_idx" ON "snapshot_sheets"("snapshot_id", "display_order");
CREATE UNIQUE INDEX "snapshot_columns_snapshot_sheet_id_name_key" ON "snapshot_columns"("snapshot_sheet_id", "name");
CREATE INDEX "snapshot_columns_snapshot_sheet_id_display_order_idx" ON "snapshot_columns"("snapshot_sheet_id", "display_order");
CREATE UNIQUE INDEX "snapshot_rows_snapshot_sheet_id_original_row_id_key" ON "snapshot_rows"("snapshot_sheet_id", "original_row_id");
CREATE INDEX "snapshot_rows_snapshot_sheet_id_row_order_idx" ON "snapshot_rows"("snapshot_sheet_id", "row_order");
CREATE UNIQUE INDEX "snapshot_relations_snapshot_id_original_relation_id_key" ON "snapshot_relations"("snapshot_id", "original_relation_id");
CREATE INDEX "snapshot_relations_snapshot_id_idx" ON "snapshot_relations"("snapshot_id");
CREATE UNIQUE INDEX "snapshot_calculated_fields_snapshot_id_original_field_id_key" ON "snapshot_calculated_fields"("snapshot_id", "original_field_id");
CREATE INDEX "snapshot_calculated_fields_snapshot_id_display_order_idx" ON "snapshot_calculated_fields"("snapshot_id", "display_order");
CREATE UNIQUE INDEX "snapshot_calculation_rules_field_step_key" ON "snapshot_calculation_rules"("snapshot_calculated_field_id", "step_order");
CREATE UNIQUE INDEX "snapshot_calculation_conditions_field_order_key" ON "snapshot_calculation_conditions"("snapshot_calculated_field_id", "condition_order");

ALTER TABLE "snapshot_sheets" ADD CONSTRAINT "snapshot_sheets_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "project_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "snapshot_columns" ADD CONSTRAINT "snapshot_columns_snapshot_sheet_id_fkey" FOREIGN KEY ("snapshot_sheet_id") REFERENCES "snapshot_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "snapshot_rows" ADD CONSTRAINT "snapshot_rows_snapshot_sheet_id_fkey" FOREIGN KEY ("snapshot_sheet_id") REFERENCES "snapshot_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "snapshot_cells" ADD CONSTRAINT "snapshot_cells_row_id_fkey" FOREIGN KEY ("row_id") REFERENCES "snapshot_rows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "snapshot_cells" ADD CONSTRAINT "snapshot_cells_column_id_fkey" FOREIGN KEY ("column_id") REFERENCES "snapshot_columns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "snapshot_relations" ADD CONSTRAINT "snapshot_relations_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "project_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "snapshot_calculated_fields" ADD CONSTRAINT "snapshot_calculated_fields_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "project_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "snapshot_calculation_rules" ADD CONSTRAINT "snapshot_calculation_rules_field_id_fkey" FOREIGN KEY ("snapshot_calculated_field_id") REFERENCES "snapshot_calculated_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "snapshot_calculation_conditions" ADD CONSTRAINT "snapshot_calculation_conditions_field_id_fkey" FOREIGN KEY ("snapshot_calculated_field_id") REFERENCES "snapshot_calculated_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;
