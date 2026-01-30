-- Add corp_cls to raw_dart_corp_master for market classification
ALTER TABLE "raw_dart_corp_master" ADD COLUMN IF NOT EXISTS "corp_cls" CHAR(1);

CREATE INDEX IF NOT EXISTS "raw_dart_corp_master_corp_cls_idx"
  ON "raw_dart_corp_master" ("corp_cls");
