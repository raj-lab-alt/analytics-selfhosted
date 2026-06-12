# Analytics Self-Hosted

## Stack
- Node.js (Express), PostgreSQL (pg + @supabase/supabase-js), WebSocket (ws)
- Hébergement : Hostinger Node.js + Supabase (PostgreSQL)
- Frontend : Vanilla JS + Chart.js + heatmap.js

## Structure
```
server.js            → Entry point (Express + WebSocket)
tracker.js           → Script client à embarquer sur les sites
install.sql          → Schema PostgreSQL
db.js                → Client Supabase (validation Hostinger)
src/
  db.js              → Client Supabase REST API (via @supabase/supabase-js)
  collect.js         → POST /collect (buffer batch insert)
  realtime.js        → WebSocket + REST endpoint sessions actives
  aggregate.js       → Agrégation horaire/journalière + nettoyage
  dashboard-api.js   → Endpoints REST pour le dashboard
dashboard/
  login.html         → Login avec mot de passe admin
  index.html         → Overview avec graphiques Chart.js
  realtime.html      → Temps réel (WebSocket + polling)
  heatmap.html       → Visualiseur heatmap
  map.html           → Carte Leaflet avec visiteurs actifs
  sites.html         → Gérer les sites trackés
  assets/
    dashboard.css
    dashboard.js
.env.example
```

## Installation
1. Copier `.env.example` → `.env` et configurer PostgreSQL (ou Supabase DATABASE_URL)
2. `npm install`
3. Accéder à `http://localhost:3000/install?key=MOT_DE_PASSE_ADMIN` (crée les tables)
4. Insérer manuellement un site dans la table `sites` (id, name, domain, api_key)
5. Démarrer : `npm start`

## Tracker JS
Embarquer sur les pages à tracker :
```html
<script src="https://votre-domaine.com/tracker.js" data-site="1" data-heatmap="true" defer></script>
```
Sans heatmap :
```html
<script src="https://votre-domaine.com/tracker.js" data-site="1" defer></script>
```

## Déploiement
1. `git add -A && git commit -m "message" && git push`
2. Hostinger redéploie automatiquement depuis GitHub (attendre ~1-2 min)

## Commandes
- `npm start` → Lance le serveur
- `npm run dev` → Mode watch (Node --watch)

## API Endpoints
- `POST /collect` → Réception des events (tracker)
- `GET /api/overview?site_id=1&days=7` → Stats quotidiennes
- `GET /api/top-pages?site_id=1&days=7` → Pages les plus vues
- `GET /api/top-sources?site_id=1&days=7` → Sources de trafic
- `GET /api/realtime?site_id=1` → Compteur actif
- `GET /api/active-sessions?site_id=1` → Sessions en cours
- `GET /api/heatmap?site_id=1&page=/` → Données heatmap
- `GET /api/visitor-locations?site_id=1` → Positions géographiques visiteurs actifs (lat/lon)
- `GET /api/sites` → Liste des sites
- `POST /api/sites` → Ajouter un site (body: {name, domain})
- WebSocket `/ws?site_id=1` → Mise à jour temps réel

## Supabase
- `SUPABASE_URL=https://aupxallaghkovsauwgcz.supabase.co`
- `SUPABASE_KEY` = anon key (dans .env)
- `SUPABASE_SERVICE_ROLE_KEY` = service_role key (dans .env)

## Caisse Module
- **CRUD**: POST/GET/PUT/DELETE `/api/caisse/operations`
- **Config**: GET/PUT `/api/caisse/config` (quotas%)
- **Summary**: GET `/api/caisse/summary`, GET `/api/caisse/central`, GET `/api/caisse/daily`, GET `/api/caisse/monthly`, GET `/api/caisse/chart?days=30`
- **Export**: GET `/api/caisse/export/csv`, GET `/api/caisse/export/pdf`
- Table `caisse_quotas`: `caisse VARCHAR(20) UNIQUE`, `type(pourcentage|formule)`, `valeur DECIMAL(10,2)`
- Table `caisse_operations` columns: `parent_id BIGINT`, `colis INT`, `livreurs INT`
- **Quota logic** (recette → quote-parts):
  1. Associés = colis × livreurs × valeur_formule (montant fixe)
  2. Reste = recette - associés
  3. Chaque caisse % = Reste × quota% / 100
- Delete cascade: supprime les lignes `parent_id = id`
- Onglets: `[+ Opération] [Centrale] [Recettes] [Associés] [Media Buy] [Loyer & Charges] [Achats] [Configuration]`

## Conventions
- Pas de dépendances lourdes au-delà de Express, pg, ws, @supabase/supabase-js
- Le tracker JS doit rester < 10KB
- Les mots de passe/tokens dans .env, jamais commités
- Le tracker JS reste < 10KB, sans dépendance externe
- Les données brutes sont purgées après 90 jours
