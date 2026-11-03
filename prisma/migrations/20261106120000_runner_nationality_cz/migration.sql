-- Státní příslušnost běžců: kdo ji nemá uvedenou (NULL / prázdný řetězec), dostane CZ.
-- Idempotentní: opakované spuštění nic nezmění (mění jen řádky bez státu, ostatní státy zůstanou).
UPDATE `cis_bezec`
SET `statni_prislusnost` = 'CZ'
WHERE `statni_prislusnost` IS NULL OR TRIM(`statni_prislusnost`) = '';

-- Noví běžci bez zadaného státu (např. import z časomíry) dostanou CZ automaticky.
-- Sloupec zůstává nullable: pořadatel může stát v administraci i odebrat („neuvedeno“).
ALTER TABLE `cis_bezec` MODIFY `statni_prislusnost` CHAR(2) NULL DEFAULT 'CZ';
