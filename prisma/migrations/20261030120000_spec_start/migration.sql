-- Speciální start běžce (jen administrace): pořadatel / brzy / pozdě / spolu s (posun vůči partnerovi).
-- Legacy tabulka mcvv_prihlaska_radek se nemění.

-- CreateTable
CREATE TABLE `mcvv_spec_start` (
    `rok` SMALLINT NOT NULL,
    `bezec_id` CHAR(8) NOT NULL,
    `typ` ENUM('organizer', 'early', 'late', 'with') NOT NULL,
    `partner_bezec_id` CHAR(8) NULL,
    `posun_s` SMALLINT NOT NULL DEFAULT 0,
    `poznamka` VARCHAR(200) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mcvv_spec_start_rok_partner_bezec_id_idx`(`rok`, `partner_bezec_id`),
    PRIMARY KEY (`rok`, `bezec_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `mcvv_spec_start` ADD CONSTRAINT `mcvv_spec_start_bezec_id_fkey` FOREIGN KEY (`bezec_id`) REFERENCES `cis_bezec`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mcvv_spec_start` ADD CONSTRAINT `mcvv_spec_start_partner_bezec_id_fkey` FOREIGN KEY (`partner_bezec_id`) REFERENCES `cis_bezec`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

