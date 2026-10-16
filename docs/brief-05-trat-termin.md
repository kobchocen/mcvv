# Brief 05 — Sekce 02 Trať + 03 Termín a místo

Pro vývojového agenta v `~/clients/kobchocen/mcvv/web`.  
**Push zakázán.** Křivku profilu (data bodů, kopce 1–4, 286/343) **nemen** — jen layout a copy.  
Mimo to: oprav v sekci 01 „chocenských“ → **choceňských**.

## Pojmy (sjednocení)

Na webu používej **trať** jako název závodní cesty (nadpisy, nav, overlay).  
**Trasa** nepoužívej v UI. Overlay mapy: **TRAŤ** (ne „TRASA ZÁVODU“).  
Důvod: trať = sportovní objekt; trasa zní jako čára v mapovém editoru.

## 02 — Trať a profil

Dnes: široký profil nahoře, mapa je v 03. Mapa patří k trati.

Layout desktop:

- **Vlevo mapa** (`mcvv-trasa.svg` + overlay START·CÍL, šipka, titulek TRAŤ).
- **Vpravo profil** — stejná výška jako mapa, **užší** (zkomprimovat vodorovně, výška sdílená s mapou).
- Karty pod tím (4 kopce, seběhy, 200 m, les) můžou zůstat pod dvojicí, full width.

Mobil: nejdřív mapa, pod ní profil (ne vedle sebe).

Profil: stejná SVG křivka a popisky kopců. Nesahaj na výpočty bodů. Přizpůsob `viewBox` / `width` kontejneru, ať se čísla 1–4 a 286/343 vejdou.

Countdown, 10:15 logika a CTA v 03 přesuň layoutem, ne logiku.

## 03 — Termín a místo

Mapa odsud pryč. Zůstane datum + countdown + CTA + **textové boxy ve stylu karet sekce 01**, obsah z legacy `kontakt.php` (ne formulář, ne Google iframe).

Boxy (návrh):

1. **Autem** — parkování v zatáčce ~1 km za Chocní na Sruby (silnice 315), 300 m pěšky. Alternativa: nábřeží Krále Jiřího, po zelené značce ~500 m na Verandu.
2. **Vlakem** — žst. Choceň (trať 010), tunelem, parkem, levý břeh Tiché Orlice (nábřeží Krále Jiřího) k hájence, tunelem pod tratí na Týniště, zelená SZ, ~2 km do centra.
3. **Autobusem** — nádraží ČSAD u kina → JZ přes most na levý břeh, dál jako z ČD.
4. **Centrum** — Velká Veranda, Choceň. GPS 49°59'45"N, 16°12'10"E + odkaz mapa (goo.gl/PT3Eoq nebo OSM). Žádná restaurace.

Pořadatel (K.O.B. Choceň, sídlo Vostelčická 256) sem nemusí — je v Rozpisu. Kontaktní formulář **nedělej**.

### Řádky u data

Pořadí:

1. Kalendář — Každou první prosincovou neděli
2. Hodiny — **Start závodu v 10:15** (bez slova „hlavního“)
3. **Pin** — Choceň · start u Velké Verandy

Ikona pinu jen u místa, ne kalendář dvakrát.

### CTA

- Label **Přihlásit se** (ne Rezervovat startovné).
- Odkaz `/prihlasky`.
- Větu „Přihlášky se otevřou později“ **smaž**.

Countdown nech.

## Mimo scope

- Přepis křivky profilu, nová mapa SVG, formulář, push.

## Akceptace

- [ ] 02: mapa vlevo, profil vpravo, stejná výška desktop; stack na mobilu.
- [ ] Overlay „TRAŤ“, žádné Trasa v UI této dvojice.
- [ ] 03 bez mapy; 4 boxy doprava; pin + pořadí řádků; Start závodu; CTA Přihlásit se → /prihlasky.
- [ ] choceňských.
- [ ] cs i en, lint + format:check.

## Hotovo

Screenshot 02+03 desktop a úzký viewport. Nic nepushovat.
