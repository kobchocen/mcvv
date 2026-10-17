-- Partner logos uploaded via admin are stored in the DB (container filesystem is ephemeral).
ALTER TABLE `sponsors`
  ADD COLUMN `logo` MEDIUMBLOB NULL,
  ADD COLUMN `logo_type` VARCHAR(32) NULL,
  ADD COLUMN `logo_hash` CHAR(16) NULL;
