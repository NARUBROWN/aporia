CREATE SCHEMA IF NOT EXISTS "project_data";

CREATE TABLE "seed_batches" (
  "id" UUID NOT NULL,
  "project_id" TEXT NOT NULL,
  "source_filename" TEXT NOT NULL,
  "source_hash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "imported_rows" BIGINT NOT NULL DEFAULT 0,
  "failed_rows" BIGINT NOT NULL DEFAULT 0,
  "started_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "seed_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_sheets" (
  "id" UUID NOT NULL,
  "project_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "physical_table_name" TEXT NOT NULL,
  "color" TEXT,
  "comment" TEXT,
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "origin" TEXT NOT NULL DEFAULT 'manual',
  "seed_batch_id" UUID,
  "row_count" BIGINT NOT NULL DEFAULT 0,
  "data_revision" BIGINT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "project_sheets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sheet_columns" (
  "id" UUID NOT NULL,
  "sheet_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "physical_column_name" TEXT NOT NULL,
  "data_type" TEXT NOT NULL,
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "color" TEXT,
  "comment" TEXT,
  "nullable" BOOLEAN NOT NULL DEFAULT true,
  "primary_key" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "sheet_columns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sheet_relations" (
  "id" UUID NOT NULL,
  "source_sheet_id" UUID NOT NULL,
  "source_column_id" UUID NOT NULL,
  "target_sheet_id" UUID NOT NULL,
  "target_column_id" UUID NOT NULL,
  "relation_type" TEXT NOT NULL,
  "relation_origin" TEXT NOT NULL DEFAULT 'manual',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sheet_relations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "calculated_fields" (
  "id" UUID NOT NULL,
  "sheet_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "field_type" TEXT NOT NULL,
  "color" TEXT,
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "calculated_fields_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "calculation_rules" (
  "id" UUID NOT NULL,
  "calculated_field_id" UUID NOT NULL,
  "step_order" INTEGER NOT NULL,
  "operation" TEXT NOT NULL,
  "arguments" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "calculation_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "calculation_conditions" (
  "id" UUID NOT NULL,
  "calculated_field_id" UUID NOT NULL,
  "source_column_id" UUID,
  "condition_order" INTEGER NOT NULL,
  "operator" TEXT NOT NULL,
  "operand_type" TEXT NOT NULL,
  "operand_value" TEXT,
  CONSTRAINT "calculation_conditions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "seed_errors" (
  "id" UUID NOT NULL,
  "seed_batch_id" UUID NOT NULL,
  "source_table" TEXT NOT NULL,
  "source_row" BIGINT,
  "error_code" TEXT NOT NULL,
  "error_message" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "seed_errors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "seed_batches_project_id_source_hash_key" ON "seed_batches"("project_id", "source_hash");
CREATE INDEX "seed_batches_project_id_created_at_idx" ON "seed_batches"("project_id", "created_at" DESC);
CREATE UNIQUE INDEX "project_sheets_physical_table_name_key" ON "project_sheets"("physical_table_name");
CREATE UNIQUE INDEX "project_sheets_project_id_name_key" ON "project_sheets"("project_id", "name");
CREATE INDEX "project_sheets_project_id_display_order_idx" ON "project_sheets"("project_id", "display_order");
CREATE UNIQUE INDEX "sheet_columns_sheet_id_name_key" ON "sheet_columns"("sheet_id", "name");
CREATE UNIQUE INDEX "sheet_columns_sheet_id_physical_column_name_key" ON "sheet_columns"("sheet_id", "physical_column_name");
CREATE INDEX "sheet_columns_sheet_id_display_order_idx" ON "sheet_columns"("sheet_id", "display_order");
CREATE UNIQUE INDEX "sheet_relations_source_column_id_target_column_id_key" ON "sheet_relations"("source_column_id", "target_column_id");
CREATE INDEX "sheet_relations_source_sheet_id_idx" ON "sheet_relations"("source_sheet_id");
CREATE INDEX "sheet_relations_target_sheet_id_idx" ON "sheet_relations"("target_sheet_id");
CREATE UNIQUE INDEX "calculated_fields_sheet_id_name_key" ON "calculated_fields"("sheet_id", "name");
CREATE INDEX "calculated_fields_sheet_id_display_order_idx" ON "calculated_fields"("sheet_id", "display_order");
CREATE UNIQUE INDEX "calculation_rules_calculated_field_id_step_order_key" ON "calculation_rules"("calculated_field_id", "step_order");
CREATE UNIQUE INDEX "calculation_conditions_calculated_field_id_condition_order_key" ON "calculation_conditions"("calculated_field_id", "condition_order");
CREATE INDEX "seed_errors_seed_batch_id_source_table_idx" ON "seed_errors"("seed_batch_id", "source_table");

ALTER TABLE "seed_batches" ADD CONSTRAINT "seed_batches_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_sheets" ADD CONSTRAINT "project_sheets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_sheets" ADD CONSTRAINT "project_sheets_seed_batch_id_fkey" FOREIGN KEY ("seed_batch_id") REFERENCES "seed_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sheet_columns" ADD CONSTRAINT "sheet_columns_sheet_id_fkey" FOREIGN KEY ("sheet_id") REFERENCES "project_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sheet_relations" ADD CONSTRAINT "sheet_relations_source_sheet_id_fkey" FOREIGN KEY ("source_sheet_id") REFERENCES "project_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sheet_relations" ADD CONSTRAINT "sheet_relations_target_sheet_id_fkey" FOREIGN KEY ("target_sheet_id") REFERENCES "project_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sheet_relations" ADD CONSTRAINT "sheet_relations_source_column_id_fkey" FOREIGN KEY ("source_column_id") REFERENCES "sheet_columns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sheet_relations" ADD CONSTRAINT "sheet_relations_target_column_id_fkey" FOREIGN KEY ("target_column_id") REFERENCES "sheet_columns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calculated_fields" ADD CONSTRAINT "calculated_fields_sheet_id_fkey" FOREIGN KEY ("sheet_id") REFERENCES "project_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calculation_rules" ADD CONSTRAINT "calculation_rules_calculated_field_id_fkey" FOREIGN KEY ("calculated_field_id") REFERENCES "calculated_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calculation_conditions" ADD CONSTRAINT "calculation_conditions_calculated_field_id_fkey" FOREIGN KEY ("calculated_field_id") REFERENCES "calculated_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calculation_conditions" ADD CONSTRAINT "calculation_conditions_source_column_id_fkey" FOREIGN KEY ("source_column_id") REFERENCES "sheet_columns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "seed_errors" ADD CONSTRAINT "seed_errors_seed_batch_id_fkey" FOREIGN KEY ("seed_batch_id") REFERENCES "seed_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
