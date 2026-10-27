-- #207 Závodní kancelář: role race_office (přidaná na konec ENUM) + prodejní položky a prodejky. Jen aditivní změny.
-- AlterTable
ALTER TABLE `mcvv_user` MODIFY `role` ENUM('registrar', 'organizer', 'admin', 'timing', 'splitmaker', 'race_office') NOT NULL;

-- CreateTable
CREATE TABLE `mcvv_sale_item` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rok` SMALLINT NOT NULL,
    `nazev` VARCHAR(80) NOT NULL,
    `cena` INTEGER NOT NULL,
    `aktivni` BOOLEAN NOT NULL DEFAULT true,
    `poradi` SMALLINT NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mcvv_sale_item_rok_aktivni_idx`(`rok`, `aktivni`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcvv_sale` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rok` SMALLINT NOT NULL,
    `cislo` INTEGER NOT NULL,
    `vs` VARCHAR(10) NOT NULL,
    `castka` INTEGER NOT NULL,
    `stav` VARCHAR(12) NOT NULL DEFAULT 'unpaid',
    `vytvoril_id` INTEGER NULL,
    `vytvoril` VARCHAR(80) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `zaplaceno_at` DATETIME(3) NULL,
    `zaplatil_zapsal` VARCHAR(80) NULL,
    `zaplatil_zapsal_id` INTEGER NULL,
    `bank_tx_id` INTEGER NULL,
    `storno_at` DATETIME(3) NULL,
    `storno_kdo` VARCHAR(80) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `mcvv_sale_vs_key`(`vs`),
    INDEX `mcvv_sale_rok_stav_idx`(`rok`, `stav`),
    INDEX `mcvv_sale_rok_created_at_idx`(`rok`, `created_at`),
    UNIQUE INDEX `mcvv_sale_rok_cislo_key`(`rok`, `cislo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcvv_sale_line` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `prodejka_id` INTEGER NOT NULL,
    `polozka_id` INTEGER NULL,
    `nazev` VARCHAR(80) NOT NULL,
    `cena` INTEGER NOT NULL,
    `kusy` SMALLINT NOT NULL,
    `castka` INTEGER NOT NULL,

    INDEX `mcvv_sale_line_prodejka_id_idx`(`prodejka_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `mcvv_sale_line` ADD CONSTRAINT `mcvv_sale_line_prodejka_id_fkey` FOREIGN KEY (`prodejka_id`) REFERENCES `mcvv_sale`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mcvv_sale_line` ADD CONSTRAINT `mcvv_sale_line_polozka_id_fkey` FOREIGN KEY (`polozka_id`) REFERENCES `mcvv_sale_item`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

