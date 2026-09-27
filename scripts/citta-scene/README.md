# Generatore della scena della città

`src/components/CityScene.js` è GENERATO: non modificarlo a mano.

- `template.html` — il prototipo della città di Nicholas (senza dati: il blocco `<script id="data">` è vuoto).
- `team_patch.py` — tutte le modifiche fatte per l'app (inquadratura misurata, squadra nei palazzi, fasi 1-4).
- `gen_scene.py` — prende template + patch e scrive il componente.

    python3 scripts/citta-scene/gen_scene.py src/components/CityScene.js

Ogni sostituzione verifica che il testo cercato esista (assert): se il template cambia, il generatore si ferma invece di produrre una scena rotta.
