-- #223: e-mailová účtenka k prodejce (aditivní, NULL pro stávající prodejky)
ALTER TABLE `mcvv_sale`
    ADD COLUMN `email` VARCHAR(128) NULL,
    ADD COLUMN `jazyk` VARCHAR(2) NULL,
    ADD COLUMN `uctenka_odeslana_at` DATETIME(3) NULL;
