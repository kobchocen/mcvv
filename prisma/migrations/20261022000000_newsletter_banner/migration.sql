-- Volitelný banner v hlavičce newsletteru (Q27).
-- Nahrané bannery se ukládají do `webimages` s novým typem „newsletter“ (jako ostatní obrázky
-- webu) a e-mail na ně odkazuje veřejnou URL /api/newsletter-banner?id=…; připravené bannery
-- jsou statické soubory v public/images/newsletter (sloupec banner_preset).

-- Typ obrázku pro bannery (idempotentní, bez pevného id).
INSERT INTO `cis_typ_webimages` (`popis`)
SELECT 'newsletter' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `cis_typ_webimages` WHERE `popis` = 'newsletter');

-- AlterTable
ALTER TABLE `mcvv_newsletter` ADD COLUMN `banner_alt` VARCHAR(200) NULL,
    ADD COLUMN `banner_image_id` SMALLINT NULL,
    ADD COLUMN `banner_link` VARCHAR(500) NULL,
    ADD COLUMN `banner_preset` VARCHAR(40) NULL;

-- CreateIndex
CREATE INDEX `mcvv_newsletter_banner_image_id_idx` ON `mcvv_newsletter`(`banner_image_id`);

-- AddForeignKey
ALTER TABLE `mcvv_newsletter` ADD CONSTRAINT `mcvv_newsletter_banner_image_id_fkey` FOREIGN KEY (`banner_image_id`) REFERENCES `webimages`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
