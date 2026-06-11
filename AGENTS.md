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
- WebSocket `/ws?site_id=1` → Mise à jour temps réel

## Conventions
- Pas de dépendances lourdes au-delà de Express, pg, ws, @supabase/supabase-js
- Le tracker JS doit rester < 10KB
- Les mots de passe/tokens dans .env, jamais commités
- Le tracker JS reste < 10KB, sans dépendance externe
- Les données brutes sont purgées après 90 jours
