# Analytics Self-Hosted

Self-hosted web analytics platform (Google Analytics alternative) built with Node.js and MySQL.

## Features
- Page views, visitors, sessions tracking
- Real-time active visitors (WebSocket)
- Click heatmaps
- Top pages and traffic sources
- Hourly/daily aggregation
- SPA support (history change detection)
- No cookies, privacy-friendly

## Quick Start
```bash
npm install
cp .env.example .env   # edit DB credentials
npm start
```

Open `http://localhost:3000/install?key=admin123` to create tables, then start tracking.
