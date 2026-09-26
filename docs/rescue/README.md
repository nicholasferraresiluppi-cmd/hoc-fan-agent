# Lavori locali mai pubblicati (salvati il 26/09/2026)

La cartella principale del progetto sul Mac di Nicholas era ferma al commit del
29/07/2026 con sopra lavoro mai committato. Qui è messo in salvo, NON pubblicato:

- **Difficoltà creator** (30/07) — `src/lib/creator-difficulty*.js`, `/admin/creator-difficulty`,
  API, test. Portato in produzione separatamente (ramo feature, 26/09).
- **Studio bio-funnel / Ads** (30/07) — `src/lib/ads-funnel-study.js`, `/admin/ads`, `src/data/`.
- **Proxy e account social** (06/08) — `src/lib/social-*`, `/admin/social-proxies`, `/admin/social-accounts`.
  Dipendenze npm aggiunte in locale (`socks-proxy-agent`, `https-proxy-agent`): vedi la patch.

`modifiche-locali-file-condivisi.patch` = le modifiche mai salvate a file condivisi
(Sidebar, Hub, middleware, dispatcher, CLAUDE.md, package.json…). NON applicarla così
com'è: quei file sono stati riscritti dopo (design system, menu per ruolo). Serve da
riferimento per ricollegare a mano i moduli che si decide di pubblicare.
