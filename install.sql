CREATE TABLE IF NOT EXISTS sites (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  domain VARCHAR(255) NOT NULL,
  api_key VARCHAR(32) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS raw_events (
  id BIGSERIAL PRIMARY KEY,
  site_id INT NOT NULL,
  api_key VARCHAR(32) DEFAULT '',
  page VARCHAR(500) NOT NULL,
  referrer VARCHAR(500) DEFAULT '',
  ua TEXT,
  ip_hash VARCHAR(64) DEFAULT '',
  country VARCHAR(4) DEFAULT '',
  city VARCHAR(100) DEFAULT '',
  screen_w INT DEFAULT 0,
  screen_h INT DEFAULT 0,
  session_id VARCHAR(36) NOT NULL,
  event_type VARCHAR(10) DEFAULT 'pageview',
  traffic_source VARCHAR(10) DEFAULT '',
  utm_source VARCHAR(100) DEFAULT '',
  utm_medium VARCHAR(100) DEFAULT '',
  utm_campaign VARCHAR(200) DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_raw_site_created ON raw_events (site_id, created_at);
CREATE INDEX IF NOT EXISTS idx_raw_created ON raw_events (created_at);

CREATE TABLE IF NOT EXISTS heatmap_events (
  id BIGSERIAL PRIMARY KEY,
  site_id INT NOT NULL,
  page_url VARCHAR(500) NOT NULL,
  x SMALLINT NOT NULL,
  y SMALLINT NOT NULL,
  viewport_w SMALLINT NOT NULL,
  viewport_h SMALLINT NOT NULL,
  scroll_y SMALLINT DEFAULT 0,
  event_type VARCHAR(10) NOT NULL CHECK (event_type IN ('click','move','scroll')),
  session_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_heat_site_page ON heatmap_events (site_id, page_url);
CREATE INDEX IF NOT EXISTS idx_heat_created ON heatmap_events (created_at);

CREATE TABLE IF NOT EXISTS active_sessions (
  session_id VARCHAR(36) PRIMARY KEY,
  site_id INT NOT NULL,
  page VARCHAR(500) DEFAULT '',
  referrer VARCHAR(500) DEFAULT '',
  country VARCHAR(4) DEFAULT '',
  city VARCHAR(100) DEFAULT '',
  lat REAL DEFAULT 0,
  lon REAL DEFAULT 0,
  ua TEXT,
  started_at TIMESTAMP DEFAULT NOW(),
  last_ping TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_active_site ON active_sessions (site_id);
CREATE INDEX IF NOT EXISTS idx_active_last_ping ON active_sessions (last_ping);

CREATE TABLE IF NOT EXISTS stats_hourly (
  id SERIAL PRIMARY KEY,
  site_id INT NOT NULL,
  heure TIMESTAMP NOT NULL,
  pages_vues INT DEFAULT 0,
  visiteurs INT DEFAULT 0,
  sessions INT DEFAULT 0,
  bounce INT DEFAULT 0,
  top_pages JSONB,
  top_sources JSONB,
  UNIQUE (site_id, heure)
);

CREATE TABLE IF NOT EXISTS stats_daily (
  id SERIAL PRIMARY KEY,
  site_id INT NOT NULL,
  jour DATE NOT NULL,
  pages_vues INT DEFAULT 0,
  visiteurs INT DEFAULT 0,
  sessions INT DEFAULT 0,
  bounce INT DEFAULT 0,
  duree_moyenne REAL DEFAULT 0,
  top_pages JSONB,
  top_sources JSONB,
  UNIQUE (site_id, jour)
);
