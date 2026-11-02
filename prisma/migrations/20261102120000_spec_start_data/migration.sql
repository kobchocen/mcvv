-- Spec. starty místo implicitních pravidel (Q220, Q225). Jen data, schéma se nemění.
-- Tabulka mcvv_start_skupina a sloupce skupina_id / skupina_poradi v mcvv_start_radek
-- zůstávají beze změny (rollback, historie); aplikace je už nepoužívá.

-- 1) Pořadatelé (Q220): běžci přihlášky č. 1 aktuálního ročníku dostanou typ „organizer“,
--    pokud spec. start ještě nemají. Ostatní ročníky se nemění.
INSERT INTO `mcvv_spec_start` (`rok`, `bezec_id`, `typ`, `partner_bezec_id`, `posun_s`, `poznamka`, `created_at`, `updated_at`)
SELECT r.`rok`, r.`bezec_id`, 'organizer', NULL, 0, NULL, NOW(3), NOW(3)
FROM `mcvv_prihlaska_radek` r
WHERE r.`prihlaska_id` = 1
  AND r.`rok` = (SELECT YEAR(i.`datum`) FROM `mcvv_info` i ORDER BY i.`datum` DESC, i.`id` DESC LIMIT 1)
  AND NOT EXISTS (
    SELECT 1 FROM `mcvv_spec_start` s WHERE s.`rok` = r.`rok` AND s.`bezec_id` = r.`bezec_id`
  );

-- 2) Skupiny → „spolu s“ (Q225): první člen skupiny (skupina_poradi, pak id) je kotva, ostatní
--    startují spolu s ním. Společný start = dvojice na stejný čas (posun 0 = druhá řada, další
--    dvojice o interval později), navazující = každý další o interval později. Jen členové
--    přihlášení v ročníku skupiny; kdo už spec. start má (např. pořadatel z kroku 1), se nemění.
INSERT INTO `mcvv_spec_start` (`rok`, `bezec_id`, `typ`, `partner_bezec_id`, `posun_s`, `poznamka`, `created_at`, `updated_at`)
SELECT m.`rok`, m.`bezec_id`, 'with', a.`bezec_id`,
  LEAST(3600,
    CASE m.`kind`
      WHEN 'joint' THEN FLOOR((m.`rn` - 1) / 2)
      ELSE m.`rn` - 1
    END * m.`interval_s`),
  CONCAT('Ze skupiny č. ', m.`skupina_id`),
  NOW(3), NOW(3)
FROM (
  SELECT sr.`rok`, sr.`bezec_id`, sr.`skupina_id`, sk.`kind`,
    ROW_NUMBER() OVER (PARTITION BY sr.`skupina_id` ORDER BY sr.`skupina_poradi`, sr.`bezec_id`) AS `rn`,
    COALESCE(
      (SELECT NULLIF(i.`st_interval`, 0) FROM `mcvv_info` i
        WHERE YEAR(i.`datum`) = sr.`rok` ORDER BY i.`id` DESC LIMIT 1),
      15) AS `interval_s`
  FROM `mcvv_start_radek` sr
  JOIN `mcvv_start_skupina` sk ON sk.`id` = sr.`skupina_id` AND sk.`rok` = sr.`rok`
  JOIN `mcvv_prihlaska_radek` pr ON pr.`rok` = sr.`rok` AND pr.`bezec_id` = sr.`bezec_id`
) m
JOIN (
  SELECT x.`skupina_id`, x.`bezec_id`
  FROM (
    SELECT sr.`skupina_id`, sr.`bezec_id`,
      ROW_NUMBER() OVER (PARTITION BY sr.`skupina_id` ORDER BY sr.`skupina_poradi`, sr.`bezec_id`) AS `rn`
    FROM `mcvv_start_radek` sr
    JOIN `mcvv_start_skupina` sk ON sk.`id` = sr.`skupina_id` AND sk.`rok` = sr.`rok`
    JOIN `mcvv_prihlaska_radek` pr ON pr.`rok` = sr.`rok` AND pr.`bezec_id` = sr.`bezec_id`
  ) x
  WHERE x.`rn` = 1
) a ON a.`skupina_id` = m.`skupina_id`
WHERE m.`rn` > 1
  AND NOT EXISTS (
    SELECT 1 FROM `mcvv_spec_start` s WHERE s.`rok` = m.`rok` AND s.`bezec_id` = m.`bezec_id`
  );
