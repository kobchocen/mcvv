-- AlterTable (additive: existing rows become 'verify')
ALTER TABLE `mcvv_email_token` ADD COLUMN `purpose` ENUM('verify', 'reset') NOT NULL DEFAULT 'verify';
