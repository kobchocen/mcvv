-- Kancelář: otevřený košík (#378). Jen nové sloupce, žádné mazání ani přejmenování.
-- k_platbe_at: null = rozpracovaná prodejka (košík), jinak čas uzavření k platbě.
-- Existující prodejky vznikaly rovnou k platbě, proto se jim doplní čas vytvoření.
ALTER TABLE `mcvv_sale` ADD COLUMN `k_platbe_at` DATETIME(3) NULL;
UPDATE `mcvv_sale` SET `k_platbe_at` = `created_at` WHERE `k_platbe_at` IS NULL;

-- dohlaska: řádek prodejky je startovné běžce (platba přihlášky bez merche).
-- Dosavadní prodejky dohlášek (#222) mají jediný řádek bez položky ceníku = startovné.
ALTER TABLE `mcvv_sale_line` ADD COLUMN `dohlaska` BOOLEAN NOT NULL DEFAULT false;
UPDATE `mcvv_sale_line` l
  JOIN `mcvv_sale` s ON s.`id` = l.`prodejka_id`
  SET l.`dohlaska` = true
  WHERE s.`prihlaska_id` IS NOT NULL AND l.`polozka_id` IS NULL;

-- prodejka_radek_id: řádek přihlášky z dohlášky ví, který řádek prodejky je jeho startovné
-- (odebrání jednoho běžce z košíku). Při sloučení / přečíslování běžce se přesouvá s řádkem.
ALTER TABLE `mcvv_prihlaska_radek` ADD COLUMN `prodejka_radek_id` INTEGER NULL;
