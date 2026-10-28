-- #200: státní příslušnost běžce (ISO 3166-1 alpha-2), NULL = neuvedeno (historická data).
-- Aditivní: jen nový nullable sloupec, existující řádky se nemění.
ALTER TABLE `cis_bezec` ADD COLUMN `statni_prislusnost` CHAR(2) NULL;
