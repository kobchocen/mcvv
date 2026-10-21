# OBD fixtures (synthetic data only)

`obd-synthetic.sql` contains made-up runners and clubs (no real participants). It covers
the quirks of the legacy export: trimming, `rekord` 0/59/60/3599/6000 s, newest club year,
PHP loose comparison of club ids (`010` hides `10` and `1e1`), Czech/Polish/Hungarian
diacritics, `;` and a tab inside a name, bib padding (`005`, `1000`), equal bibs ordered by
category, bibs 0/NULL and other years excluded, year taken from the last `mcvv_info` by id.

Golden files were produced by running the **unchanged** legacy `data/prihl2obd.php`
(PHP 8.3 CLI, `pdo_mysql`) against this data in MariaDB, with the connection charset set
to `cp1250` (the only harness change; the older `oldweb/zavod/prihl2obd.php` did the same
with `SET CLIENT_ENCODING TO 'WIN1250'`):

- `obd-synthetic.legacy-html.bin` – full HTTP response body of the legacy page,
- `obd-synthetic.legacy-txt.bin` – the part between `<pre>\n\t\t` and `</pre>`
  (what the script echoes),
- `obd-synthetic.json` – rows of the four legacy SQL queries in the order MariaDB returned
  them (input of `renderObdExport`).
