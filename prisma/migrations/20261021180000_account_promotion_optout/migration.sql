-- Souhlas se zasíláním informací e-mailem se přesouvá z přihlášky (mcvv_prihlaska.promotion) na účet.
-- NULL = účet nerozhodl (newsletter dál rozhoduje podle poslední přihlášky se stejným e-mailem).
ALTER TABLE `mcvv_user` ADD COLUMN `promotion_optout` BOOLEAN NULL;

-- Backfill: rozhoduje poslední přihláška e-mailu (rok, created, id – stejné pořadí jako
-- latestPromotionOptOuts), 'N' = nechce. Prázdné přihlášky bez běžců s promotion NULL se
-- nepočítají: vznikaly automaticky návštěvou /prihlasky a nesmí přebít dřívější odhlášení.
UPDATE `mcvv_user` u
JOIN (
  SELECT d.email_key, d.opt_out
  FROM (
    SELECT
      LOWER(TRIM(p.`email`)) AS email_key,
      (UPPER(TRIM(COALESCE(p.`promotion`, ''))) = 'N') AS opt_out,
      ROW_NUMBER() OVER (
        PARTITION BY LOWER(TRIM(p.`email`))
        ORDER BY p.`rok` DESC, p.`created` DESC, p.`id` DESC
      ) AS rn
    FROM `mcvv_prihlaska` p
    WHERE p.`email` LIKE '%@%'
      AND (
        UPPER(TRIM(COALESCE(p.`promotion`, ''))) = 'N'
        OR EXISTS (
          SELECT 1 FROM `mcvv_prihlaska_radek` r
          WHERE r.`rok` = p.`rok` AND r.`prihlaska_id` = p.`id`
        )
      )
  ) d
  WHERE d.rn = 1
) latest ON latest.email_key = LOWER(TRIM(u.`email`))
SET u.`promotion_optout` = latest.opt_out;
