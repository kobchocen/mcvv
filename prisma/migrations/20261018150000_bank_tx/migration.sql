-- Párování plateb Fio: jen nové (prázdné) tabulky, žádný zásah do existujících tabulek.

-- CreateTable
CREATE TABLE `mcvv_bank_tx` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fio_id` BIGINT NOT NULL,
    `datum` DATE NOT NULL,
    `castka` DECIMAL(10, 2) NOT NULL,
    `mena` VARCHAR(3) NOT NULL,
    `vs` VARCHAR(20) NULL,
    `protiucet` VARCHAR(64) NULL,
    `protiucet_nazev` VARCHAR(255) NULL,
    `zprava` VARCHAR(255) NULL,
    `raw` JSON NOT NULL,
    `stav` ENUM('processing', 'matched', 'unmatched', 'ignored', 'dry_run') NOT NULL DEFAULT 'processing',
    `duvod` VARCHAR(40) NULL,
    `rok` SMALLINT NULL,
    `prihlaska_id` SMALLINT NULL,
    `platba_id` INTEGER NULL,
    `preplatek` INTEGER NOT NULL DEFAULT 0,
    `vraceno_at` DATETIME(3) NULL,
    `auto_potvrzeno` BOOLEAN NOT NULL DEFAULT false,
    `poznamka` VARCHAR(500) NULL,
    `vyresil` VARCHAR(64) NULL,
    `v_souhrnu_at` DATETIME(3) NULL,
    `created` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated` DATETIME(3) NOT NULL,

    UNIQUE INDEX `mcvv_bank_tx_fio_id_key`(`fio_id`),
    INDEX `mcvv_bank_tx_stav_idx`(`stav`),
    INDEX `mcvv_bank_tx_rok_prihlaska_id_idx`(`rok`, `prihlaska_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcvv_job_state` (
    `name` VARCHAR(64) NOT NULL,
    `value` VARCHAR(255) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcvv_job_run` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `job` VARCHAR(32) NOT NULL,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finished_at` DATETIME(3) NULL,
    `ok` BOOLEAN NULL,
    `mode` VARCHAR(16) NULL,
    `fetched` INTEGER NOT NULL DEFAULT 0,
    `matched` INTEGER NOT NULL DEFAULT 0,
    `unmatched` INTEGER NOT NULL DEFAULT 0,
    `error` VARCHAR(500) NULL,

    INDEX `mcvv_job_run_job_started_at_idx`(`job`, `started_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
