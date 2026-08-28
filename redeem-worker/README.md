# Brew or False - Redeem Worker

Worker minimal dédié uniquement à la vérification serveur des codes
admin/invité — pas de `players`, pas de `score`, pas de leaderboard.
(Le leaderboard public de Brew or False vit dans `../leaderboard-worker/`,
un Worker séparé.)

## État actuel — ✅ DÉPLOYÉ ET ACTIF (2026-08-26)

- Worker : `https://bf-redeem.carolestromboni.workers.dev`
  (`wrangler.jsonc` : name `bf-redeem`)
- D1 : `bf-redeem` (id dans `wrangler.jsonc`), table `code_redemptions`
- Secrets `ADMIN_CODE` / `GUEST_CODE` définis via `wrangler secret put`
  (valeurs dans le `.dev.vars` git-ignoré de ce dossier)
- Frontend **actif** : `WT_CONFIG.redeemApi.apiBaseUrl` renseigné ;
  `storage.js: tryRedeemPremiumCodeRemote` appelle d'abord ce endpoint puis
  retombe sur la vérif locale par format sur `NOT_FOUND` / injoignable

Les étapes ci-dessous sont l'historique de la mise en place.

## Ce que fait le Worker

- `POST /redeem-code` — vérifie un code contre deux secrets Cloudflare
  (`ADMIN_CODE`, `GUEST_CODE`), jamais envoyés au client.

Stockage: une seule table, `code_redemptions`.

## Codes admin et invité

- `ADMIN_CODE`
  - marche sur autant d'appareils que tu veux, sans limite d'usage
  - à usage interne (tes propres tests)
- `GUEST_CODE`
  - limité à 10 rédemptions au total (compteur côté serveur, table
    `code_redemptions`)
  - au-delà de 10, le Worker répond `403 GUEST_CODE_EXHAUSTED`
  - pour "changer" le code, il suffit de mettre à jour le secret: une
    nouvelle valeur repart automatiquement à 0 usage, puisque le compteur
    est indexé sur la valeur du code, pas sur un nom fixe

Un code qui ne correspond à aucun des deux secrets renvoie `404 NOT_FOUND`
— c'est le signal que le frontend (`storage.js: tryRedeemPremiumCodeRemote`)
utilise pour retomber sur l'ancienne vérification locale par format, donc
les vrais codes clients (format `BF-XXXX-XXXX`) continuent de marcher
pendant qu'on met en place la vérification Stripe réelle (pas encore
faite — suivi à part, même limite que sur les apps sœurs).

## Etape 1 - Créer le Worker

Depuis `redeem-worker/`:

```bash
npm create cloudflare@latest .
```

Choisis: Worker simple en JavaScript, pas de framework. Si le dossier
n'est pas vide, crée le projet ailleurs puis copie dedans:

- `wrangler.jsonc.example`
- `schema.sql`
- `src/index.js`

## Etape 2 - Créer la base D1

```bash
npx wrangler d1 create bf-redeem
```

Colle `database_id` dans `wrangler.jsonc` (à partir de
`wrangler.jsonc.example`).

## Etape 3 - Appliquer le schéma

```bash
npx wrangler d1 execute bf-redeem --remote --file=./schema.sql
```

## Etape 4 - Définir les secrets

```bash
npx wrangler secret put ADMIN_CODE
npx wrangler secret put GUEST_CODE
```

Chaque commande demande la valeur en interactif et ne l'affiche jamais
dans les logs. Choisis des chaînes longues et peu devinables (pas besoin
de suivre le format `BF-0000-0000`, ce ne sont pas des identifiants
publics).

## Etape 5 - Déployer

```bash
npx wrangler deploy
```

Note l'URL finale du Worker, par exemple:

- `https://bf-redeem.<subdomain>.workers.dev`

## Etape 6 - Brancher le frontend

Dans `config.js`, renseigner:

```js
redeemApi: {
  apiBaseUrl: "https://bf-redeem.<subdomain>.workers.dev",
  requestTimeoutMs: 4000
}
```

## Design du payload

### `POST /redeem-code`

```json
{
  "device_uuid": "uuid-local",
  "code": "le-code-tape-par-l-utilisateur"
}
```

Réponses possibles:

```json
{ "ok": true, "tier": "admin" }
```

```json
{ "ok": true, "tier": "guest", "uses_remaining": 6 }
```

```json
{ "ok": false, "reason": "GUEST_CODE_EXHAUSTED" }
```

```json
{ "ok": false, "reason": "NOT_FOUND" }
```
