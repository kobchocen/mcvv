# Připomínky plateb

`POST /api/cron/reminders` (Bearer `CRON_SECRET`), volá ho stejný plánovaný job jako `/api/cron/mail`
a `/api/cron/payments` (každých 15 min). E-maily jdou do fronty jako `reminder` (priorita 1),
odešle je `/api/cron/mail` v rámci denního limitu.

- Jen přihlášky ve stavu 2 (nezaplacená) se zbývající částkou > 0 a e-mailem.
- **R1**: ≥ 24 h od poslední změny přihlášky (max. z `created`, řádků a `mcvv_prihlaska_meta.updated_at`),
  okno 8–20 h Praha, jen do konce standardních přihlášek. Jednou.
- **R2** byla nahrazena doplatkem standardu (níže); sloupec `pripominka2_at` zůstává jen historicky.
- Obsah: rekapitulace přihlášky, zaplaceno / zbývá, platební údaje (účet, IBAN, VS, zpráva), QR (PNG z `/api/platba-qr`).
- Evidence: `mcvv_prihlaska_meta.pripominka1_at` (podmíněný update) + `dedupe_key` ve frontě.
- `REMINDERS_DRY_RUN` (výchozí mimo `APP_ENV=prod`): jen spočítat, nic nezařadit.

## Doplatek standardu a automatické zrušení

Běží ve stejném cronu po R1 (`src/lib/slots/standard-pay-job.ts`), časy z nastavení ročníku
(administrace ročníku → Termíny přihlášek, viz `PRIHLASKY-TERMINY.md`).

- Týká se nezaplacených (stav 2) přihlášek ze standardu (a early) se startovným > 0 a zbývající
  částkou > 0. Přihlášky se startovným zdarma se neruší.
- **E-mail „zaplaťte dnes do 12:00“** (`doplatek_std_mail`, výchozí čt 3. 12. 7:00, priorita
  `confirmation`): jednou, evidence `mcvv_prihlaska_meta.doplatek_mail_at` + `dedupe_key`
  `standardpay:rok:id`.
- **Automatické zrušení** po `doplatek_std_do` (výchozí čt 3. 12. 12:00): až po úspěšném stažení plateb
  (Fio), které začalo po lhůtě; když stažení nejde, nejpozději po 60 min (alert). Stav 2 → 0, řádky
  smazány, `auto_zruseno_at`, audit `entry.cancelled` (`actor_role = system`), e-mail o zrušení
  s nabídkou pozdní přihlášky (jen když je zapnutá) a přihlášky na místě.
- **Zrušená přihláška se nikdy neobnovuje.** Platba, která přijde po zrušení, zůstane nespárovaná
  (důvod „přihláška zrušena“) a objeví se v `/admin/platby` v sekci „Platby na zrušené přihlášky –
  k vrácení“ spolu s částečnými platbami automaticky zrušených přihlášek. Tlačítko „Vráceno“
  (`vraceno_at`, audit). Ruční přiřazení platby ke zrušené přihlášce je zakázané.
- Auto-potvrzení plateb platí do posledního dne placení podle termínů (lhůta doplatku, případně konec
  zapnutých pozdních přihlášek); bez termínů do 3. 12.
- `REMINDERS_DRY_RUN` platí i zde: mimo prod se jen počítá; e-maily mimo prod jdou na adresu
  administrátora s předponou `[TEST – …]`.
