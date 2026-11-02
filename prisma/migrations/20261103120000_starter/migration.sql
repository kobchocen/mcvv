-- Startér (#starter): nová role „starter“ s jedním koridorem a obrazovka /start.
-- Jen nové sloupce s výchozími hodnotami a nová hodnota výčtu, existující data se nemění.
-- Koridor: 1 = čísla 1 … st_druhy_od − 1, 2 = od st_druhy_od (model ročníku).

-- AlterTable
ALTER TABLE `mcvv_user` MODIFY `role` ENUM('registrar', 'organizer', 'admin', 'timing', 'splitmaker', 'race_office', 'starter') NOT NULL,
    ADD COLUMN `start_corridor` TINYINT NULL;

-- AlterTable
ALTER TABLE `mcvv_start_check` ADD COLUMN `marked_at` DATETIME(3) NULL,
    ADD COLUMN `not_marked` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `split_code` VARCHAR(2) NULL,
    ADD COLUMN `split_at` DATETIME(3) NULL,
    ADD COLUMN `corridor` TINYINT NULL,
    ADD COLUMN `real_start_at` DATETIME(3) NULL,
    ADD COLUMN `late` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `mcvv_start_check_entry` ADD COLUMN `marked_at` DATETIME(3) NULL;
