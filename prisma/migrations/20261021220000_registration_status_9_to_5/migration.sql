-- Jednorázový převod legacy stavu přihlášky 9 („potvrzeno“, legacy admin/sendpotvr.php) na nový
-- kód 5 (ENTRY_STATUS.confirmed). Schváleno Pavlem (Q20). Týká se ročníků 2017–2025 včetně
-- přihlášky pořadatelů č. 1; v produkci 1 565 řádků. Idempotentní: opakované spuštění nic nezmění.
-- Jiné sloupce se nemění (žádné e-maily, audit ani přepočet plateb – stav se jen přejmenovává).
UPDATE `mcvv_prihlaska` SET `stav` = 5 WHERE `stav` = 9;
