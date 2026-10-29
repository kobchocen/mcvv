-- Online výsledky / speaker / OFeed: `WHERE rok = ?` nad mcvv_split bez indexu (PK začíná
-- číslem) četl celou tabulku. Aditivní: jen nový index, data se nemění.
CREATE INDEX `mcvv_split_rok_idx` ON `mcvv_split`(`rok`);
