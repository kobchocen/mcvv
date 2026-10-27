-- Evidence startu (#203): kdo opravdu odstartoval (jen evidence, výsledky ji nečtou).
-- Jen nové tabulky, existující data se nemění. Stanoviště „start“ má v mcvv_user.split_stations kód "0".

-- CreateTable
CREATE TABLE `mcvv_start_check` (
    `rok` SMALLINT NOT NULL,
    `cislo` SMALLINT NOT NULL,
    `started_at` DATETIME(3) NOT NULL,
    `source` VARCHAR(8) NOT NULL,
    `user_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`rok`, `cislo`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcvv_start_check_entry` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entry_key` VARCHAR(80) NOT NULL,
    `rok` SMALLINT NOT NULL,
    `cislo` SMALLINT NOT NULL,
    `started_at` DATETIME(3) NULL,
    `offset_s` INTEGER NULL,
    `source` VARCHAR(8) NOT NULL,
    `action` VARCHAR(8) NOT NULL,
    `replaces` VARCHAR(80) NULL,
    `outcome` VARCHAR(12) NOT NULL,
    `note` VARCHAR(255) NULL,
    `user_id` INTEGER NULL,
    `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `mcvv_start_check_entry_entry_key_key`(`entry_key`),
    INDEX `mcvv_start_check_entry_rok_cislo_idx`(`rok`, `cislo`),
    INDEX `mcvv_start_check_entry_rok_outcome_idx`(`rok`, `outcome`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
