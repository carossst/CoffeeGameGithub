# Brew or False - Leaderboard Worker

Backend du leaderboard public, calqué sur `leaderboard-worker/` de Pickleball
Rules Quiz. Séparé du `redeem-worker/` (codes premium) et de l'app statique :
il peut être déployé, mis à jour ou arrêté sans toucher au jeu.

## Ce que fait le Worker

- `POST /player` — crée ou met à jour le pseudo et l'opt-in
- `DELETE /player?device_uuid=...` — retire le joueur du classement et supprime
  ses scores
- `POST /score` — reçoit une RUN complète, **recalcule le score côté serveur**
  à partir de `src/content-key.js` (jamais la valeur envoyée par le client),
  met à jour les best `weekly` et `all`
- `GET /leaderboard?window=weekly|all` — top 10 public

Stockage : 3 tables D1 — `players`, `score_submissions`, `leaderboard_best`
(voir `schema.sql`).

## Anti-triche

`POST /score` rejette (409/422) :

- `run_mode` ≠ `RUN`
- `content_version` ≠ `LEADERBOARD_CONTENT_VERSION` (`CONTENT_VERSION_MISMATCH`)
- format de `answers` invalide, `id` inconnu, doublon d'`id`
- durée totale improbable (`IMPROBABLE_DURATION_MS`, `IMPROBABLE_PERFECT_RUN`)
- `run_id` déjà soumis → réponse idempotente (renvoie le score déjà enregistré)

Rate-limiting IP + device en mémoire (voir `RATE_LIMIT_RULES`).

## src/content-key.js

Généré depuis `content.json` du repo. À régénérer si le contenu change :

```bash
node -e '
const c = require("./content.json");
const entries = c.items.map(i => [i.id, i.correctAnswer === true]);
const line = "[" + entries.map(e => `[${e[0]},${e[1]}]`).join(",") + "]";
require("fs").writeFileSync(
  "leaderboard-worker/src/content-key.js",
  `export const LEADERBOARD_CONTENT_VERSION = ${JSON.stringify(String(c.version))};\n\nexport const ANSWER_KEY_ENTRIES = ${line};\n`
);
'
```

Puis aligner `config.leaderboard.contentVersion` côté frontend et redéployer.

## Étape 1 - Créer le Worker

Depuis `leaderboard-worker/` — le dossier n'est pas vide, donc générer ailleurs
puis copier `wrangler.jsonc.example`, `schema.sql`, `src/` :

```bash
npm create cloudflare@latest ../tmp-lb -- --type=hello-world --lang=js --no-deploy --git=false
```

(Choix : Worker JavaScript « Hello World », pas de déploiement immédiat.)

## Étape 2 - Créer la base D1

```bash
npx wrangler d1 create bf-leaderboard
```

Colle `database_id` dans `wrangler.jsonc` (à partir de `wrangler.jsonc.example`).

## Étape 3 - Appliquer le schéma

```bash
npx wrangler d1 execute bf-leaderboard --remote --file=./schema.sql
```

## Étape 4 - Déployer

```bash
npx wrangler deploy
```

URL finale, par exemple : `https://bf-leaderboard.<subdomain>.workers.dev`

## Étape 5 - Brancher le frontend

Dans `config.js` → `WT_CONFIG.leaderboard` :

```js
leaderboard: {
  enabled: true,
  apiBaseUrl: "https://bf-leaderboard.<subdomain>.workers.dev",
  submitScores: false, // passer à true après vérif des soumissions/rejets/rangs
  contentVersion: "1.4"
}
```

## Règle du leaderboard hebdo

`weekly` utilise une vraie semaine ISO : début lundi `00:00 UTC`. Pas de reset
destructif — filtre sur `week_key` (`2026-W35`). À expliquer aux users :
« This week — resets every Monday ».

## Payloads

### `POST /player`

```json
{ "device_uuid": "uuid-local", "nickname": "BrewBoss", "opt_in": true }
```

### `POST /score`

```json
{
  "device_uuid": "uuid-local",
  "run_id": "uuid-run",
  "run_number": 7,
  "content_version": "1.4",
  "run_mode": "RUN",
  "duration_ms": 84231,
  "answers": [
    { "id": 22, "answer": true, "ms": 2100 },
    { "id": 29, "answer": false, "ms": 1800 }
  ]
}
```

### `GET /leaderboard?window=weekly`

```json
{
  "ok": true,
  "window": "weekly",
  "week_key": "2026-W35",
  "top": [
    { "rank": 1, "nickname": "BrewBoss", "score_fp": 18 },
    { "rank": 2, "nickname": "RoastNerd", "score_fp": 17 }
  ]
}
```
