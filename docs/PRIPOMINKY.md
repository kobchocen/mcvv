# Připomínky plateb

`POST /api/cron/reminders` (Bearer `CRON_SECRET`), volá ho stejný plánovaný job jako `/api/cron/mail`
a `/api/cron/payments` (každých 15 min). E-maily jdou do fronty jako `reminder` (priorita 1),
odešle je `/api/cron/mail` v rámci denního limitu.

- Jen přihlášky ve stavu 2 (nezaplacená) se zbývající částkou > 0 a e-mailem.
- **R1**: ≥ 24 h od poslední změny přihlášky (max. z `created`, řádků a `mcvv_prihlaska_meta.updated_at`),
  okno 8–20 h Praha, jen do konce uzávěrky. Jednou.
- **R2**: 3. 12. ráno (7:00–11:59 Praha), jednou – i když už R1 odešla.
- Obsah: rekapitulace přihlášky, zaplaceno / zbývá, platební údaje (účet, IBAN, VS, zpráva), QR (PNG z `/api/platba-qr`).
- Evidence: `mcvv_prihlaska_meta.pripominka1_at` / `pripominka2_at` (podmíněný update) + `dedupe_key` ve frontě.
- `REMINDERS_DRY_RUN` (výchozí mimo `APP_ENV=prod`): jen spočítat, nic nezařadit.
- Rušení nezaplacených přihlášek po uzávěrce zůstává ruční.
