-- Den závodu: deník mezičasů (idempotence, audit, konflikty) a API klíče zařízení (#120, #121).
-- Legacy tabulka mcvv_split se nemění.

CREATE TABLE `mcvv_split_entry` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entry_key` VARCHAR(80) NOT NULL,
    `rok` SMALLINT NOT NULL,
    `split` CHAR(1) NOT NULL,
    `cislo` SMALLINT NOT NULL,
    `time` INTEGER NULL,
    `punched_at` DATETIME(3) NULL,
    `source` VARCHAR(8) NOT NULL,
    `action` VARCHAR(8) NOT NULL,
    `replaces` VARCHAR(80) NULL,
    `outcome` VARCHAR(12) NOT NULL,
    `note` VARCHAR(255) NULL,
    `autor` VARCHAR(8) NOT NULL,
    `user_id` INTEGER NULL,
    `token_id` INTEGER NULL,
    `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `mcvv_split_entry_entry_key_key`(`entry_key`),
    INDEX `mcvv_split_entry_rok_split_cislo_idx`(`rok`, `split`, `cislo`),
    INDEX `mcvv_split_entry_rok_outcome_idx`(`rok`, `outcome`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `mcvv_ingest_token` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `label` VARCHAR(64) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `prefix` VARCHAR(16) NOT NULL,
    `rok` SMALLINT NOT NULL,
    `splits` VARCHAR(8) NOT NULL DEFAULT '9',
    `author` VARCHAR(8) NOT NULL DEFAULT 'LuM',
    `valid_from` DATETIME(3) NOT NULL,
    `valid_until` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `last_used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` INTEGER NULL,

    UNIQUE INDEX `mcvv_ingest_token_token_hash_key`(`token_hash`),
    INDEX `mcvv_ingest_token_rok_idx`(`rok`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
