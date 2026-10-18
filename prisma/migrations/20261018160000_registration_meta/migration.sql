-- Připomínky plateb: nová (prázdná) tabulka, legacy mcvv_prihlaska se nemění.

-- CreateTable
CREATE TABLE `mcvv_prihlaska_meta` (
    `rok` SMALLINT NOT NULL,
    `id` SMALLINT NOT NULL,
    `updated_at` DATETIME(3) NULL,
    `pripominka1_at` DATETIME(3) NULL,
    `pripominka2_at` DATETIME(3) NULL,

    PRIMARY KEY (`rok`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
