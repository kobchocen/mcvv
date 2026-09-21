# Ověření přípravy vydávání – 8. 9. 2026

## Prošlo

- Aplikační testy: 18 Node/TypeScript + 3 ESM + 3 Python testy.
  Zahrnují TLS politiku, skutečný vstup Prisma CLI, výpočet semantic-release,
  shodu verze v zápatí/API/chartu, pořadí build/push a zastavení publikace při chybě.
  Azure, GitHub a push image jsou v publikačních unit testech nahrazené izolovanými stuby.
- ESLint bez chyb i varování, Prettier, TypeScript a generování Next.js route typů.
- Kontrola verzí a větví, Helm lint a render production/staging (lokální Helm 4.2.2;
  GitHub runner má připnutý Helm 3.19.0 přes podporovanou setup-helm action).
- Instalátor infrastruktury spuštěn dvakrát na dočasné kopii: opakování nemění zdroje.
  V této kopii prošlo `make test`: 42 Python + 3 Node testy. Skutečný sousední
  checkout se nepodařilo upravit kvůli systémovému zákazu zápisu.
- Nový pnpm lockfile zachovává původní záznamy a registry integrity. Nové uzamčené
  závislosti jsou převzaté z existujícího Daxaris lockfile; ověřena úplnost grafu
  (žádné chybějící závislosti) a shoda importerů s package.json.

## Nepotvrzeno / blokováno prostředím

- Čistá instalace nových release závislostí: npm registry je nedostupná i mimo
  sandbox (ENOTFOUND). Pnpm supply-chain kontrola tak nemůže stáří balíků ověřit.
  Politika nebyla vypnuta. Lokální testy používají již dostupné přesné verze balíků;
  finální `pnpm install --frozen-lockfile` musí projít na GitHub runneru.
- Aktuální `pnpm build` v čisté kopii selže při stahování Inter/Oswald z Google Fonts,
  také mimo sandbox. Route typegen a TypeScript zvlášť prošly. Fonty nebyly nahrazené.
- `pnpm test:integration` mimo sandbox nemá přístup k `/var/run/docker.sock`
  (`operation not permitted`). Aktuální Docker build, MySQL/TLS migrace a persistence
  tudíž nejsou nově potvrzené. Dříve dodaný CI log potvrzoval oba Docker buildy,
  ale skončil chybou následné migrace; opravu Prisma CLI je potřeba potvrdit v CI.
- Publikace větví/tagů, ACR push, nastavení GitHub secrets/rulesets/OIDC a skutečné
  nasazení nebyly provedené. Dostupný GitHub konektor dříve odmítl zápis do mcvv
  (403); infrastrukturní repozitář vracel 404. Git zápisy jsou v tomto prostředí
  vyhrazené lidskému operátorovi.
- Auditové příznaky MySQL a persistence v infrastruktuře nebyly přepnuté na true.

Před aktivací postupovat podle [APPLICATION-DELIVERY.md](APPLICATION-DELIVERY.md).
