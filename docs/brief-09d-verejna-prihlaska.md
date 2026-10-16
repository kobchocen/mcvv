# Brief 09d — Veřejná přihláška

Větev **feature/admin**. Push jen na ni. Admin (A–C) nesahej, jen odkaz z menu nepřidávej na veřejný web.

Ověřovací e-mail jde přes **Resend** (ne Azure SMTP). Bez ověřeného e-mailu nelze založit přihlášku.

## Účet

`/registrace` — jméno, e-mail, heslo. Role `registrar`. Heslo hash jako u adminu. E-mail unikátní (case-insensitive).

Po odeslání formuláře účet vznikne s `emailVerified = null`. Session ještě ne. Na e-mail odejde odkaz (platnost 24 h, jednorázový token v DB, ne v URL jako heslo).

`/overeni?token=` nastaví `emailVerified`, smaže token, založí session a přesměruje na moji přihlášku.

Neověřený účet se na `/prihlaseni` nepřihlásí — obecná hláška a možnost poslat odkaz znovu. Špatný e-mail při registraci: stejná hláška jako u existujícího účtu neenumerovat; když e-mail už je ověřený, říct „přihlaste se“.

Env (do `.env.example` prázdné, ostré jen na Mini):

- `RESEND_API_KEY`
- `MAIL_FROM` například `MCVV <noreply@mcvv.org>`

Odeslání přes `https://api.resend.com/emails`. Když klíč chybí, registrace vrátí chybu, účet bez mailu nezakládat.

`/prihlaseni` už je. Registrar se do `/admin` nedostane. Admin a organizer seed z env ověření nepotřebují (`emailVerified` doplnit při seedu).

## Moje přihláška

Nahradit placeholder `/prihlasky`.

Bez session → výzva Přihlásit se / Založit účet. Žádný formulář závodníků.

S session:

- Najít `mcvv_prihlaska` kde `lower(email) = lower(User.email)`.
- Aktuální rok = rok z nejnovějšího `mcvv_info.datum` (2026).
- Jedna přihláška na e-mail a rok. Když není a uzávěrka (`prihl_datum`) ještě neproběhla (nebo je null), založit: další `id` v roce, `typ = O`, `stav = 2`, `autor` = e-mail.
- Po uzávěrce novou nezakládat, starou jen číst.
- Edit hlavičky do uzávěrky: název, poznámka, promotion (prázdné = maily ano, `N` = ne). E-mail přihlášky = e-mail účtu, needitovat.

Minulé ročníky stejného e-mailu: jen seznam (rok, název, počet), bez editace.

## Běžci

Do uzávěrky.

**Rychlá nabídka:** distinct běžci z přihlášek stejného e-mailu v minulých letech, kteří letos ještě nejsou v žádné přihlášce. Jedním klikem přidat řádek.

**Nový:** ročník narození, jméno, příjmení, pohlaví. Id jako legacy: `RRRR` + `0` (M) nebo `5` (F) + pořadí (`…001`, další +1). Jméno v `cis_bezec` ve tvaru `Příjmení Jméno`. Stejné jméno a stejný prefix id → použít existujícího, nezakládat duplikát. Když už letos běží v jiné přihlášce, přidání odmítnout.

Kategorie: jen odpovídající pohlaví a věku (rok závodu − ročník ≥ `age`, mimo „bez omezení“ kde `age = 0`). Startovné = `cis_mcvv_kateg.startovne` (online), ne cena na místě.

Klub: název z hlavičky přihlášky. Letos existuje → použít. Jinak stejný název v historii → stejné `id`, řádek pro letošní rok. Jinak nové číselné `id` (max číselné < `AAA` + 1, jinak 111).

Řádek: `klub_id`, `kateg_id`, `startovne`, `prihlaska_id`, `rok`. Číslo (`cislo`) v této vlně nepřidělovat.

Odebrat řádek jen do uzávěrky a jen z vlastní přihlášky.

## Platba a QR

Text (stejné údaje jako legacy):

- účet `2700938285/2010` (Fio)
- IBAN `CZ8820100000002700938285`
- BIC `FIOBCZPPXXX`
- VS = rok + id bez mezer (`2026` a id `32` → `202632`)
- částka k úhradě = součet startovného − přijaté platby (párovat platbu číselně)

QR jen když k úhradě > 0. Obsah SPD:

`SPD*1.0*ACC:CZ8820100000002700938285*AM:{částka}*CC:CZK*MSG:STARTOVNE MCVV PRIHLASKA {id}*X-VS:{VS}`

Obrázek QR na stránce (knihovna v projektu, ne externí URL s částkou). Pod ním účet, IBAN, VS, částka.

Přijaté platby jen číst (datum, částka).

## Mimo

Maily jen ověření účtu (Resend). Žádné potvrzení přihlášky, startovka, tisk čísel, los, online platba, newsletter, smazání celé přihlášky.

## Akceptace

lint + format:check + typecheck. Commit, push.

Screenshot: registrace + text že e-mail odešel, moje přihláška s rychlou nabídkou, přidání běžce, blok platby s QR.
