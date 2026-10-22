-- Sjednocení názvů klubů (#104): kanonické kluby, aliasy zapsaných názvů a zamítnuté návrhy.
-- Jen nové prázdné tabulky; migrace žádná data nemapuje. Kluby se slučují výhradně ručním
-- potvrzením návrhu v administraci (Číselníky → Kluby – sloučení).
-- CreateTable
CREATE TABLE `mcvv_klub` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(80) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `mcvv_klub_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcvv_klub_alias` (
    `key` VARCHAR(80) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `klub_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `author` VARCHAR(255) NULL,

    INDEX `mcvv_klub_alias_klub_id_idx`(`klub_id`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcvv_klub_navrh_zamitnuty` (
    `key_a` VARCHAR(80) NOT NULL,
    `key_b` VARCHAR(80) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `author` VARCHAR(255) NULL,

    PRIMARY KEY (`key_a`, `key_b`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `mcvv_klub_alias` ADD CONSTRAINT `mcvv_klub_alias_klub_id_fkey` FOREIGN KEY (`klub_id`) REFERENCES `mcvv_klub`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
