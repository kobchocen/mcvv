-- Nula startu pořadatelů (#382). Migrace jen přidává sloupec; existující data se nemění.
ALTER TABLE `mcvv_info` ADD COLUMN `st_nula_porad_s` INTEGER NULL;
