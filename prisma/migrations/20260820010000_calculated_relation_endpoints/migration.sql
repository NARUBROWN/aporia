-- 관계 키는 물리 컬럼 또는 계산 필드 중 정확히 하나를 참조합니다.
ALTER TABLE "sheet_relations"
  ALTER COLUMN "source_column_id" DROP NOT NULL,
  ALTER COLUMN "target_column_id" DROP NOT NULL,
  ADD COLUMN "source_calculated_field_id" UUID,
  ADD COLUMN "target_calculated_field_id" UUID;

ALTER TABLE "sheet_relations"
  ADD CONSTRAINT "sheet_relations_source_endpoint_check"
    CHECK (num_nonnulls("source_column_id", "source_calculated_field_id") = 1),
  ADD CONSTRAINT "sheet_relations_target_endpoint_check"
    CHECK (num_nonnulls("target_column_id", "target_calculated_field_id") = 1),
  ADD CONSTRAINT "sheet_relations_source_calculated_field_id_fkey"
    FOREIGN KEY ("source_calculated_field_id") REFERENCES "calculated_fields"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "sheet_relations_target_calculated_field_id_fkey"
    FOREIGN KEY ("target_calculated_field_id") REFERENCES "calculated_fields"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "sheet_relations_source_column_id_target_calculated_field_id_key"
  ON "sheet_relations"("source_column_id", "target_calculated_field_id");
CREATE UNIQUE INDEX "sheet_relations_source_calculated_field_id_target_column_id_key"
  ON "sheet_relations"("source_calculated_field_id", "target_column_id");
CREATE UNIQUE INDEX "sheet_relations_source_calculated_field_id_target_calculate_key"
  ON "sheet_relations"("source_calculated_field_id", "target_calculated_field_id");
