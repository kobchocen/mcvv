-- Počasí ročníku: typ počasí a štítky trati (aditivní, nullable; původní `weather` zůstává).
ALTER TABLE `mcvv_info` ADD COLUMN `pocasi_typ` VARCHAR(16) NULL,
    ADD COLUMN `trat_stitky` VARCHAR(120) NULL;
