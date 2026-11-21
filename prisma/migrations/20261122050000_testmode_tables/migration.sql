-- Testovací režim závodu (B+, bod 6): nové tabulky mcvv_test_*, jen aditivní, bez vazby na ostrá data.
-- CreateTable
CREATE TABLE `mcvv_test_run` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `stav` VARCHAR(10) NOT NULL DEFAULT 'planned',
    `rok` SMALLINT NOT NULL DEFAULT 9026,
    `nula_at` DATETIME(3) NOT NULL,
    `konec_at` DATETIME(3) NOT NULL,
    `likvidace_at` DATETIME(3) NOT NULL,
    `startovka` VARCHAR(5) NOT NULL DEFAULT 'draw',
    `fiktivnich` SMALLINT NOT NULL DEFAULT 0,
    `config` TEXT NOT NULL,
    `report` MEDIUMTEXT NULL,
    `zalozil` VARCHAR(80) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `started_at` DATETIME(3) NULL,
    `ended_at` DATETIME(3) NULL,
    `cleaned_at` DATETIME(3) NULL,

    INDEX `mcvv_test_run_stav_nula_at_idx`(`stav`, `nula_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcvv_test_start` (
    `test_run_id` INTEGER NOT NULL,
    `cislo` SMALLINT NOT NULL,
    `jmeno` VARCHAR(80) NOT NULL,
    `kategorie` CHAR(1) NOT NULL,
    `klub` VARCHAR(80) NULL,
    `fiktivni` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`test_run_id`, `cislo`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcvv_test_onsite` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `test_run_id` INTEGER NOT NULL,
    `cislo` SMALLINT NOT NULL,
    `jmeno` VARCHAR(80) NOT NULL,
    `rocnik` SMALLINT NULL,
    `pohlavi` VARCHAR(1) NULL,
    `kategorie` CHAR(1) NOT NULL,
    `klub` VARCHAR(80) NULL,
    `platba` VARCHAR(10) NOT NULL DEFAULT 'sim_cash',
    `zalozil` VARCHAR(80) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `mcvv_test_onsite_test_run_id_cislo_key`(`test_run_id`, `cislo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `mcvv_test_start` ADD CONSTRAINT `mcvv_test_start_test_run_id_fkey` FOREIGN KEY (`test_run_id`) REFERENCES `mcvv_test_run`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mcvv_test_onsite` ADD CONSTRAINT `mcvv_test_onsite_test_run_id_fkey` FOREIGN KEY (`test_run_id`) REFERENCES `mcvv_test_run`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
