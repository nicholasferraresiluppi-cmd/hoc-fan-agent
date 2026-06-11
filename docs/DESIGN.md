# Design system — Dark SaaS (HOC)

> Questo file definisce lo stile visivo vincolante per tutta la UI di questo progetto.
> Leggi e applica queste regole prima di creare o modificare qualsiasi componente di interfaccia.
> Il campione visivo renderizzabile è `design-reference.html` (stessa cartella): quando hai un dubbio su come deve apparire qualcosa, quel file è la risposta.

## 1. Filosofia — le 4 regole d'oro

1. **La gerarchia la fa la luminosità, non il colore.** Sfondo < superficie < bordo < testo. Ogni livello è appena più chiaro del precedente.
2. **Un solo accent (viola), col contagocce.** Solo per: elemento attivo, dato corrente, azione primaria. Mai due elementi accent che competono nella stessa vista.
3. **Niente nero puro, niente bianco puro.** Quasi-neri bluastri, quasi-bianchi freddi.
4. **Flat.** Niente gradienti, glow, blur o ombre decorative. La profondità si costruisce con superfici e bordi.

## 2. Token — fonte di verità

```css
:root {
  /* Superfici (dal più scuro al più chiaro) */
  --bg-sunken:   #0a0d11;  /* sidebar, aree incassate */
  --bg:          #0c0f14;  /* sfondo pagina */
  --surface:     #151a22;  /* card, pannelli, input */
  --surface-2:   #20283a;  /* hover, elemento attivo */

  /* Bordi */
  --border:      #232b3a;  /* bordo standard di card e input */
  --border-soft: #1d2430;  /* divider interni, righe tabella */

  /* Testo */
  --text:        #f2f4f8;  /* titoli, valori, testo primario */
  --text-2:      #cdd3de;  /* testo secondario */
  --muted:       #8c95a8;  /* label, didascalie, placeholder */
  --muted-2:     #5d6678;  /* icone inattive */

  /* Accent (uno solo) */
  --accent:           #8b7cf6;  /* azione primaria, attivo, dato corrente */
  --accent-ink:       #14101f;  /* testo sopra superfici accent */
  --accent-soft:      #2a2353;  /* sfondo badge/chip accent */
  --accent-soft-text: #b9aef9;  /* testo su accent-soft */
  --accent-dim:       #3a3470;  /* serie non-correnti nei grafici */

  /* Semantici (solo come segnale, mai come superfici grandi) */
  --success: #4ade80;
  --danger:  #f08c8c;

  /* Geometria */
  --radius-sm:   6px;    /* badge, elementi piccoli */
  --radius-md:   10px;   /* card, input, bottoni */
  --radius-pill: 999px;  /* pill, avatar, search */
}
```

### Tailwind

Se il progetto usa Tailwind v4, registra i token nel CSS globale:

```css
@theme {
  --color-bg-sunken: #0a0d11;
  --color-bg: #0c0f14;
  --color-surface: #151a22;
  --color-surface-2: #20283a;
  --color-border-std: #232b3a;
  --color-border-soft: #1d2430;
  --color-ink: #f2f4f8;
  --color-ink-2: #cdd3de;
  --color-muted: #8c95a8;
  --color-muted-2: #5d6678;
  --color-accent: #8b7cf6;
  --color-accent-ink: #14101f;
  --color-accent-soft: #2a2353;
  --color-accent-soft-text: #b9aef9;
  --color-accent-dim: #3a3470;
  --color-success: #4ade80;
  --color-danger: #f08c8c;
}
```

Se il progetto è su Tailwind v3, mappa gli stessi hex in `theme.extend.colors` dentro `tailwind.config`. In entrambi i casi: usa sempre i token, mai hex inline nei componenti.

## 3. Tipografia

- Font: **Inter** (fallback: system sans). Due pesi soltanto: **400** e **500**. Mai 600/700.
- Scala: `11px` micro-label e badge · `12px` corpo UI e tabelle · `14–15px` titoli di sezione · `19–22px` valori KPI.
- I numeri importanti si fanno notare con dimensione e contrasto, non con il grassetto pesante.
- Sentence case ovunque. Niente MAIUSCOLO, niente Title Case.

## 4. Ricette componenti

**Card / pannello** — `background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 12–16px;`

**KPI** — label `11px var(--muted)` sopra, valore `19px / 500 var(--text)` sotto, eventuale delta come badge accanto al valore.

**Badge delta / chip** — `background: var(--accent-soft); color: var(--accent-soft-text); border-radius: var(--radius-sm); font-size: 11px; padding: 2px 6px;`. Per variazioni positive/negative in tabella basta il testo colorato (`--success` / `--danger`) a 11px, senza sfondo.

**Bottone primario** — `background: var(--accent); color: var(--accent-ink); border-radius: 8px; padding: 7px 14px; font-size: 12px; font-weight: 500;`. Uno solo per vista.

**Bottone secondario** — `background: var(--surface-2); color: var(--text-2); border: 1px solid var(--border);` stessa geometria del primario.

**Sidebar** — `background: var(--bg-sunken); border-right: 1px solid var(--border-soft);`. Voce attiva: `background: var(--surface-2)` + icona `var(--accent)`. Voci inattive: icona `var(--muted-2)`, al hover `var(--muted)`.

**Input / search** — `background: var(--surface); border: 1px solid var(--border); color: var(--text);` placeholder `var(--muted)`. Search come pill (`--radius-pill`).

**Tabelle / liste** — divider `1px var(--border-soft)` tra le righe, niente zebra striping, hover riga `var(--surface-2)`. Valori numerici allineati a destra.

**Grafici** — serie storica/contesto in `var(--accent-dim)`, valore corrente o selezionato in `var(--accent)`. Mai palette multicolore: se servono più serie, distinguile per luminosità dentro la famiglia viola-grigio.

**Stati** — online/ok: pallino `var(--success)` 7px. Negativo/errore: `var(--danger)` solo come testo o segnale puntuale, mai come sfondo di aree grandi.

## 5. Spaziatura e layout

- Griglia base 4px. Padding card 12–16px, gap tra card 10–12px, margini di sezione 14–16px.
- KPI in griglia responsive: `repeat(auto-fit, minmax(140px, 1fr))`.
- Densità da strumento di lavoro: compatta ma respirabile. In dubbio, togli decorazione e tieni lo spazio.

## 6. Do / Don't

| Do | Don't |
|---|---|
| Gerarchia con i 4 livelli di superficie | `#000` o `#fff` puri |
| Un solo elemento accent per vista | Viola su bottoni, link, icone e bordi insieme |
| Token sempre (`var(--…)` o classi Tailwind) | Hex hardcoded nei componenti |
| Pesi 400/500 | Bold 600/700, testo tutto maiuscolo |
| Flat: superfici + bordi | Gradienti, glow, blur, ombre decorative |
| Delta come testo 11px o badge soft | Verde/rosso come sfondo di card intere |

## 7. Accessibilità

- `--muted` solo su `--bg` o `--surface` (contrasto ok); mai testo muted su accent.
- Focus visibile su ogni elemento interattivo: `outline: 2px solid var(--accent); outline-offset: 2px;`.
- Le icone decorative hanno `aria-hidden="true"`; i bottoni solo-icona hanno `aria-label`.

## 8. Checklist per ogni nuova schermata

1. Sfondo `--bg`, contenuti su `--surface`, mai card su card senza motivo.
2. C'è un solo punto viola dominante nella vista? Se ce n'è più d'uno, togline.
3. Tutti i colori vengono dai token? Cerca hex inline e sostituiscili.
4. Pesi solo 400/500, font-size mai sotto 11px.
5. Confronta a occhio con `design-reference.html`: se stona, è la schermata nuova a doversi adeguare.

---

## 9. Implementazione in questo repo

I token vivono in `src/lib/brand.js` (oggetto `CP`): i NOMI chiave legacy
(`textPrimary`, `surfaceAlt`, `accentGreen`…) sono mantenuti per
retrocompatibilità ma i VALORI sono quelli di questo design system.
Mapping: `accentGreen` → `--success` · `accentRed` → `--danger` ·
`accent/accentInk/accentSoft/accentSoftText/accentDim` → famiglia accent ·
`bgSunken/borderSoft/mutedIcons` → nuovi token. I componenti condivisi
(`src/components/cp-style.js`) applicano tipografia e geometria del sistema.
Per qualsiasi componente nuovo: usa i token CP, mai hex inline.
