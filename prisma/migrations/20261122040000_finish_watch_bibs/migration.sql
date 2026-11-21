-- #252 Cíl: stopky (fronta časů) a stanice čísel. Jen nové tabulky.
-- CreateTable
CREATE TABLE `mcvv_finish_punch` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entry_key` VARCHAR(80) NOT NULL,
    `rok` SMALLINT NOT NULL,
    `punched_at` DATETIME(3) NOT NULL,
    `source` VARCHAR(8) NOT NULL,
    `smazano` BOOLEAN NOT NULL DEFAULT false,
    `note` VARCHAR(255) NULL,
    `user_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `mcvv_finish_punch_entry_key_key`(`entry_key`),
    INDEX `mcvv_finish_punch_rok_punched_at_idx`(`rok`, `punched_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcvv_finish_bib` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entry_key` VARCHAR(80) NOT NULL,
    `rok` SMALLINT NOT NULL,
    `cislo` SMALLINT NOT NULL,
    `read_at` DATETIME(3) NOT NULL,
    `poradi` DOUBLE NOT NULL,
    `source` VARCHAR(8) NOT NULL,
    `smazano` BOOLEAN NOT NULL DEFAULT false,
    `note` VARCHAR(255) NULL,
    `user_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `mcvv_finish_bib_entry_key_key`(`entry_key`),
    INDEX `mcvv_finish_bib_rok_poradi_idx`(`rok`, `poradi`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
