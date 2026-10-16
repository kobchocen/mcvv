# Brief 04c — Rozpis: copy, TOC, přihlášky-placeholder

Pro vývojového agenta v `~/clients/kobchocen/mcvv/web`.  
**Push zakázán. Profil a sekci 03 nesahej.**

## Kontext

Rozpis `/program` čte Edition 34. Owner revidoval. Surový klíč `Program.intervalNote` musí zmizet.

## 1) Obsah (TOC)

Levý „Na této stránce“ ať **putuje s scrollováním** (`sticky` pod navbarem), dokud obsah stránky sahá. Na mobilu neschovávej úplně, pokud to jde (compact / collapse), ať kotvy zůstanou.

## 2) Šipka nahoru

Plovoucí tlačítko vpravo dole: skok na začátek stránky. `aria-label` cs „Nahoru“ / en „Back to top“. Accent, nevelké. Objevit po odscrollování (~viewport).

## 3) Popis tratě

Pryč **„cca“**. Přesně: 4 300 m, 400 m asfalt, převýšení 200 m.

## 4) Přihlášky

Ne „online později“ jako mrtvá věta bez cíle.

- Odkaz na **`/prihlasky`** (cs i en pathnames).
- Stránka zatím **placeholder**: nadpis Přihlášky, stav „Přihlášky ještě nejsou otevřeny“, datum závodu, startovné z Edition 34, odkaz zpět na Rozpis. **Žádný formulář.**
- Na Rozpisu: „Online přihláška“ → `/prihlasky`. Na místě do 9:45. Platnost online až po platbě.

## 5) Startovné

Pryč věta „Částky bere rozpis z aktuálního ročníku.“

Doplnit **storno** (nové, owner): startovné vracíme při odhlášení **do termínu online přihlášek**; po termínu ne. Termín ber z `prihlDatum` edice 34 (2026-12-02), s formulací, že platí až poběží online.

Vrátit smysl legacy: vítězové hlavní kategorie muži a ženy + členové klubu veteránů MCVV startovné **zdarma** při včasné online přihlášce. Bez odkazů na neexistující `/s_vitezove`.

Sazby nech z DB (100/200, 50/100).

## 6) Kategorie

Pryč obě věty: „Ročník narození = 2026 minus…“ i „Pořadatel může sloučit…“.

Sloupce: kategorie | ročník narození (text).

- `age = 0` (muži, ženy): **bez omezení**
- `age ≤ 20`: `{2026 − age} a mladší`
- `age > 20`: `{2026 − age} a starší`

## 7) Ceny

Prvních pět částek = **kategorie muži a ženy** (1.–5. místo), **ne** „absolutní pořadí“.

Veteráni 1.–3. místo beze změny.

Doplnit legacy: **věcné ceny** pro nejlepší v žákovských a dorosteneckých kategoriích.

## Legacy, co ještě chybí / je zkreslené

Oprav v tom samém briefu:

- Start: přeložit `intervalNote` (interval 15 s, jedna vlna, žádný dětský start). Žádný raw klíč.
- Upozornění: závod **není vhodný** pro děti mladší 6 let (ne „jen s doprovodem“, pokud owner neřekl jinak). Do listiny jen ten, kdo jde **celou trať bez pomoci** jiné osoby.
- GDPR: stačí stávající zkrácený odstavec; drone/foto z legacy nemusíš vracet celý.
- Pořadatel: **K.O.B. Choceň** — „z.s.“ jen pokud je to v copy záměr. Default bez z.s., jako legacy.

## Mimo scope

- Skutečný formulář, platby, mapa, profil, push, 04b landing (až po tomto).

## Akceptace

- [ ] TOC sticky, šipka nahoru.
- [ ] Bez „cca“, bez meta věty o DB, bez raw i18n klíčů.
- [ ] `/prihlasky` placeholder + odkaz z Rozpisu.
- [ ] Storno + slevy vítězů/veteránů.
- [ ] Kategorie mladší/starší/bez omezení.
- [ ] Ceny = muži+ženy 1.–5., veteráni 1.–3., věcné žáci/dorost.
- [ ] cs i en, lint + format:check.

## Hotovo

Screenshoty: horní část + startovné/kategorie/ceny + `/prihlasky`. Nic nepushovat.
