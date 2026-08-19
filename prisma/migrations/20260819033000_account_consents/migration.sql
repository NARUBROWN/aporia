ALTER TABLE "users"
ADD COLUMN "terms_agreed_at" TIMESTAMPTZ(6),
ADD COLUMN "privacy_agreed_at" TIMESTAMPTZ(6),
ADD COLUMN "terms_version" TEXT,
ADD COLUMN "privacy_version" TEXT;

UPDATE "users"
SET
  "terms_agreed_at" = "created_at",
  "privacy_agreed_at" = "created_at",
  "terms_version" = '2026-08-19',
  "privacy_version" = '2026-08-19'
WHERE "terms_agreed_at" IS NULL;

ALTER TABLE "users"
ALTER COLUMN "terms_agreed_at" SET NOT NULL,
ALTER COLUMN "privacy_agreed_at" SET NOT NULL,
ALTER COLUMN "terms_version" SET NOT NULL,
ALTER COLUMN "privacy_version" SET NOT NULL;
