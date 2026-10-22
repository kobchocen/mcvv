-- Sloučení klubů přepisuje data (#104, Q45). Navazuje na 20261022130000_club_identity_by_id.
--
-- Dosud (1.4.0) se sloučení jen zapisovalo do mcvv_klub_slouceni (sloučené id -> hlavní id)
-- a skládalo se až při čtení. Nově sloučení v administraci přepíše klub_id na hlavní id
-- a sloučené id zmizí. Tato migrace jednorázově provede totéž pro sloučení, která už
-- v mcvv_klub_slouceni jsou (produkce: 0 řádků, staging: pár), a tabulku zruší – historie
-- sloučení je v auditu (mcvv_audit_log, action 'club.merge', detail = stav před sloučením).
-- Bez řádků v mcvv_klub_slouceni se nic nemění (jen DROP TABLE). Idempotentní není potřeba:
-- migrace běží jednou, vše v ní se řídí obsahem mcvv_klub_slouceni.
--
-- Pravidla (stejná jako planClubMerge v src/lib/clubs/merge.ts), pro každý ročník:
-- * řádek cis_klub má jen sloučené id -> převede se na hlavní id i s názvem ročníku
--   (ON UPDATE CASCADE převede i přihlášky, startovky a výsledky toho ročníku),
-- * řádek má hlavní id (kolize) -> zůstane řádek a název hlavního id, řádek sloučeného id se
--   smaže; se dvěma sloučenými id v ročníku bez hlavního se převede to s menším id,
-- * řádky mcvv_prihlaska_radek / mcvv_start / mcvv_time v ročníku bez řádku cis_klub (legacy
--   import bez číselníku) -> hlavní id dostane řádek s nejnovějším názvem (cizí klíč).
-- Sloučení je vždy ploché (hlavní id samo sloučené není), takže stačí jeden průchod.

-- Plán po ročnících, spočtený před jakoukoli změnou.
CREATE TABLE `_mcvv_klub_slouceni_plan` (
    `klub_id` VARCHAR(8) NOT NULL,
    `hlavni_klub_id` VARCHAR(8) NOT NULL,
    `rok` SMALLINT NOT NULL,
    `akce` VARCHAR(8) NOT NULL,
    PRIMARY KEY (`klub_id`, `rok`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `_mcvv_klub_slouceni_plan` (`klub_id`, `hlavni_klub_id`, `rok`, `akce`)
SELECT s.`klub_id`, s.`hlavni_klub_id`, k.`rok`,
       CASE WHEN EXISTS (SELECT 1 FROM `cis_klub` m
                         WHERE m.`id` = s.`hlavni_klub_id` AND m.`rok` = k.`rok`)
              OR EXISTS (SELECT 1 FROM `mcvv_klub_slouceni` s2
                         JOIN `cis_klub` k2 ON k2.`id` = s2.`klub_id` AND k2.`rok` = k.`rok`
                         WHERE s2.`hlavni_klub_id` = s.`hlavni_klub_id` AND s2.`klub_id` < s.`klub_id`)
            THEN 'dropped' ELSE 'moved' END
FROM `mcvv_klub_slouceni` s
JOIN `cis_klub` k ON k.`id` = s.`klub_id`
WHERE s.`klub_id` <> s.`hlavni_klub_id`;

-- Ročníky s řádky sloučeného id, ale bez řádku cis_klub hlavního ani žádného sloučeného id.
INSERT INTO `_mcvv_klub_slouceni_plan` (`klub_id`, `hlavni_klub_id`, `rok`, `akce`)
SELECT x.`klub_id`, x.`hlavni_klub_id`, x.`rok`, 'created'
FROM (
    SELECT DISTINCT s.`klub_id`, s.`hlavni_klub_id`, t.`rok`
    FROM `mcvv_klub_slouceni` s
    JOIN (SELECT `klub_id`, `rok` FROM `mcvv_prihlaska_radek`
          UNION SELECT `klub_id`, `rok` FROM `mcvv_start`
          UNION SELECT `klub_id`, `rok` FROM `mcvv_time`) t ON t.`klub_id` = s.`klub_id`
    WHERE s.`klub_id` <> s.`hlavni_klub_id`
) x
WHERE NOT EXISTS (SELECT 1 FROM `cis_klub` m WHERE m.`id` = x.`hlavni_klub_id` AND m.`rok` = x.`rok`)
  AND NOT EXISTS (SELECT 1 FROM `mcvv_klub_slouceni` s2
                  JOIN `cis_klub` k2 ON k2.`id` = s2.`klub_id` AND k2.`rok` = x.`rok`
                  WHERE s2.`hlavni_klub_id` = x.`hlavni_klub_id`);

-- Audit: jeden záznam na sloučené id s úplným stavem před přepisem (stejný tvar jako
-- ClubMergeAuditDetail v src/lib/clubs/merge-apply.ts, source = 'migration').
INSERT INTO `mcvv_audit_log` (`created_at`, `actor_user_id`, `actor_email`, `actor_role`, `action`, `target`, `detail`)
SELECT NOW(3), NULL, LEFT(COALESCE(s.`author`, 'migrace'), 255), 'system', 'club.merge',
       LEFT(CONCAT('club:', s.`hlavni_klub_id`), 128),
       JSON_OBJECT(
         'version', 1,
         'source', 'migration',
         'main', s.`hlavni_klub_id`,
         'merged', s.`klub_id`,
         'mergedAt', CAST(s.`created_at` AS CHAR),
         'cisKlub', JSON_OBJECT(
           'moved', COALESCE((SELECT JSON_ARRAYAGG(JSON_OBJECT('rok', k.`rok`, 'jmeno', k.`jmeno`,
                                'created', CAST(k.`created` AS CHAR), 'autor', k.`autor`))
                              FROM `cis_klub` k JOIN `_mcvv_klub_slouceni_plan` p
                                ON p.`klub_id` = k.`id` AND p.`rok` = k.`rok` AND p.`akce` = 'moved'
                              WHERE k.`id` = s.`klub_id`), JSON_ARRAY()),
           'dropped', COALESCE((SELECT JSON_ARRAYAGG(JSON_OBJECT('rok', k.`rok`, 'jmeno', k.`jmeno`,
                                'created', CAST(k.`created` AS CHAR), 'autor', k.`autor`))
                              FROM `cis_klub` k JOIN `_mcvv_klub_slouceni_plan` p
                                ON p.`klub_id` = k.`id` AND p.`rok` = k.`rok` AND p.`akce` = 'dropped'
                              WHERE k.`id` = s.`klub_id`), JSON_ARRAY()),
           'created', COALESCE((SELECT JSON_ARRAYAGG(JSON_OBJECT('rok', p.`rok`))
                              FROM `_mcvv_klub_slouceni_plan` p
                              WHERE p.`klub_id` = s.`klub_id` AND p.`akce` = 'created'), JSON_ARRAY())
         ),
         'rows', JSON_OBJECT(
           'mcvv_prihlaska_radek', COALESCE((SELECT JSON_ARRAYAGG(JSON_ARRAY(r.`rok`, r.`bezec_id`))
                              FROM `mcvv_prihlaska_radek` r WHERE r.`klub_id` = s.`klub_id`), JSON_ARRAY()),
           'mcvv_start', COALESCE((SELECT JSON_ARRAYAGG(JSON_ARRAY(r.`rok`, r.`bezec_id`))
                              FROM `mcvv_start` r WHERE r.`klub_id` = s.`klub_id`), JSON_ARRAY()),
           'mcvv_time', COALESCE((SELECT JSON_ARRAYAGG(JSON_ARRAY(r.`rok`, r.`bezec_id`))
                              FROM `mcvv_time` r WHERE r.`klub_id` = s.`klub_id`), JSON_ARRAY())
         ),
         'rejectedPairs', COALESCE((SELECT JSON_ARRAYAGG(JSON_ARRAY(z.`klub_id_a`, z.`klub_id_b`))
                              FROM `mcvv_klub_navrh_zamitnuty` z
                              WHERE z.`klub_id_a` = s.`klub_id` OR z.`klub_id_b` = s.`klub_id`), JSON_ARRAY())
       )
FROM `mcvv_klub_slouceni` s
WHERE s.`klub_id` <> s.`hlavni_klub_id`;

-- 1) Chybějící ročníky hlavního id (cíl cizího klíče) s jeho nejnovějším názvem.
INSERT INTO `cis_klub` (`id`, `rok`, `jmeno`, `created`, `autor`)
SELECT c.`hlavni_klub_id`, c.`rok`,
       COALESCE((SELECT m.`jmeno` FROM `cis_klub` m WHERE m.`id` = c.`hlavni_klub_id`
                 ORDER BY m.`rok` DESC LIMIT 1), ''),
       NOW(3), 'migrace-slouceni'
FROM (SELECT DISTINCT `hlavni_klub_id`, `rok` FROM `_mcvv_klub_slouceni_plan`
      WHERE `akce` = 'created') c;

-- 2) Ročníky jen sloučeného id: řádek přejde na hlavní id (CASCADE převede i jeho řádky).
UPDATE `cis_klub` k
JOIN `_mcvv_klub_slouceni_plan` p ON p.`klub_id` = k.`id` AND p.`rok` = k.`rok` AND p.`akce` = 'moved'
SET k.`id` = p.`hlavni_klub_id`;

-- 3) Zbylé řádky sloučených id (kolize a doplněné ročníky) dostanou hlavní id.
UPDATE `mcvv_prihlaska_radek` r JOIN `mcvv_klub_slouceni` s ON s.`klub_id` = r.`klub_id`
SET r.`klub_id` = s.`hlavni_klub_id` WHERE s.`klub_id` <> s.`hlavni_klub_id`;

UPDATE `mcvv_start` r JOIN `mcvv_klub_slouceni` s ON s.`klub_id` = r.`klub_id`
SET r.`klub_id` = s.`hlavni_klub_id` WHERE s.`klub_id` <> s.`hlavni_klub_id`;

UPDATE `mcvv_time` r JOIN `mcvv_klub_slouceni` s ON s.`klub_id` = r.`klub_id`
SET r.`klub_id` = s.`hlavni_klub_id` WHERE s.`klub_id` <> s.`hlavni_klub_id`;

-- 4) Kolizní řádky sloučených id: zůstává řádek a název hlavního id.
DELETE k FROM `cis_klub` k
JOIN `mcvv_klub_slouceni` s ON s.`klub_id` = k.`id`
WHERE s.`klub_id` <> s.`hlavni_klub_id`;

-- 5) Zamítnuté návrhy se sloučeným id (id už neexistuje).
DELETE z FROM `mcvv_klub_navrh_zamitnuty` z
JOIN `mcvv_klub_slouceni` s ON s.`klub_id` = z.`klub_id_a` OR s.`klub_id` = z.`klub_id_b`
WHERE s.`klub_id` <> s.`hlavni_klub_id`;

DROP TABLE `_mcvv_klub_slouceni_plan`;

-- DropTable
DROP TABLE `mcvv_klub_slouceni`;
