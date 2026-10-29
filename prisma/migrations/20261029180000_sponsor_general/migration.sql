-- Q153: generální partner (pevné logo na resultboardu). Nejvýš jeden – hlídá uložení v adminu.
-- Aditivní: nový sloupec s výchozí hodnotou 0, existující řádky se nemění.
ALTER TABLE `sponsors` ADD COLUMN `generalni` BOOLEAN NOT NULL DEFAULT false;
