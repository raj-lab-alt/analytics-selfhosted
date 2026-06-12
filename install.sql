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
  x_ratio REAL DEFAULT 0,
  y_ratio REAL DEFAULT 0,
  doc_height REAL DEFAULT 0,
  event_type VARCHAR(10) NOT NULL CHECK (event_type IN ('click','move','touch','scroll')),
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

CREATE TABLE IF NOT EXISTS heatmap_clicks (
  id BIGSERIAL PRIMARY KEY,
  site_id INT NOT NULL,
  session_id VARCHAR(36) NOT NULL,
  visitor_id VARCHAR(36) DEFAULT '',
  page_url VARCHAR(500) NOT NULL,
  page_path VARCHAR(500) DEFAULT '',
  x_pixel INT NOT NULL,
  y_pixel INT NOT NULL,
  x_percent REAL NOT NULL,
  y_percent REAL NOT NULL,
  scroll_y INT DEFAULT 0,
  viewport_w INT DEFAULT 0,
  viewport_h INT DEFAULT 0,
  document_w INT DEFAULT 0,
  document_h INT DEFAULT 0,
  element_tag VARCHAR(50) DEFAULT '',
  element_id VARCHAR(255) DEFAULT '',
  element_class VARCHAR(500) DEFAULT '',
  element_text_hash VARCHAR(128) DEFAULT '',
  cta_name VARCHAR(255) DEFAULT '',
  is_cta BOOLEAN DEFAULT false,
  is_dead_click BOOLEAN DEFAULT false,
  is_rage_click BOOLEAN DEFAULT false,
  device_type VARCHAR(10) DEFAULT '',
  utm_source VARCHAR(100) DEFAULT '',
  utm_medium VARCHAR(100) DEFAULT '',
  utm_campaign VARCHAR(200) DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hc_site_page ON heatmap_clicks (site_id, page_url);
CREATE INDEX IF NOT EXISTS idx_hc_cta ON heatmap_clicks (site_id, cta_name);
CREATE INDEX IF NOT EXISTS idx_hc_dead ON heatmap_clicks (site_id, is_dead_click);
CREATE INDEX IF NOT EXISTS idx_hc_rage ON heatmap_clicks (site_id, is_rage_click);
CREATE INDEX IF NOT EXISTS idx_hc_created ON heatmap_clicks (created_at);

CREATE TABLE IF NOT EXISTS heatmap_scrolls (
  id BIGSERIAL PRIMARY KEY,
  site_id INT NOT NULL,
  session_id VARCHAR(36) NOT NULL,
  visitor_id VARCHAR(36) DEFAULT '',
  page_url VARCHAR(500) NOT NULL,
  page_path VARCHAR(500) DEFAULT '',
  max_scroll_percent REAL DEFAULT 0,
  max_scroll_y INT DEFAULT 0,
  viewport_h INT DEFAULT 0,
  document_h INT DEFAULT 0,
  time_on_page_seconds INT DEFAULT 0,
  device_type VARCHAR(10) DEFAULT '',
  utm_source VARCHAR(100) DEFAULT '',
  utm_medium VARCHAR(100) DEFAULT '',
  utm_campaign VARCHAR(200) DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (session_id, page_url)
);
CREATE INDEX IF NOT EXISTS idx_hs_site_page ON heatmap_scrolls (site_id, page_url);
CREATE INDEX IF NOT EXISTS idx_hs_created ON heatmap_scrolls (created_at);

CREATE TABLE IF NOT EXISTS form_events (
  id BIGSERIAL PRIMARY KEY,
  site_id INT NOT NULL,
  session_id VARCHAR(36) NOT NULL,
  visitor_id VARCHAR(36) DEFAULT '',
  page_url VARCHAR(500) NOT NULL,
  page_path VARCHAR(500) DEFAULT '',
  event_name VARCHAR(50) NOT NULL,
  form_name VARCHAR(255) DEFAULT '',
  field_name VARCHAR(255) DEFAULT '',
  field_type VARCHAR(50) DEFAULT '',
  field_order INT DEFAULT 0,
  device_type VARCHAR(10) DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fe_site_page ON form_events (site_id, page_url);
CREATE INDEX IF NOT EXISTS idx_fe_name ON form_events (site_id, event_name);
CREATE INDEX IF NOT EXISTS idx_fe_form ON form_events (site_id, form_name);
CREATE INDEX IF NOT EXISTS idx_fe_created ON form_events (created_at);

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

CREATE TABLE IF NOT EXISTS caisse_quotas (
  id SERIAL PRIMARY KEY,
  caisse VARCHAR(20) NOT NULL UNIQUE,
  type VARCHAR(15) NOT NULL DEFAULT 'pourcentage' CHECK (type IN ('pourcentage','formule')),
  valeur DECIMAL(10,2) NOT NULL DEFAULT 0,
  valeur2 DECIMAL(10,2) DEFAULT NULL,
  valeur3 DECIMAL(10,2) DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);
INSERT INTO caisse_quotas (caisse, type, valeur, valeur2, valeur3) VALUES
  ('associes','formule',1.00,2,0),
  ('media_buy','pourcentage',20.00,NULL,NULL),
  ('loyer_charges','pourcentage',10.00,NULL,NULL),
  ('achats','pourcentage',40.00,NULL,NULL)
ON CONFLICT (caisse) DO NOTHING;

CREATE TABLE IF NOT EXISTS caisse_operations (
  id BIGSERIAL PRIMARY KEY,
  operation_date DATE NOT NULL,
  libelle VARCHAR(255) NOT NULL DEFAULT '',
  type VARCHAR(10) NOT NULL CHECK (type IN ('in','out')),
  amount DECIMAL(12,3) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'TND',
  caisse VARCHAR(20) NOT NULL DEFAULT 'recettes',
  payment_method VARCHAR(30) DEFAULT '',
  reference VARCHAR(100) DEFAULT '',
  note TEXT DEFAULT '',
  parent_id BIGINT DEFAULT NULL,
  colis INT DEFAULT NULL,
  livreurs INT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_caisse_date ON caisse_operations (operation_date);
CREATE INDEX IF NOT EXISTS idx_caisse_caisse ON caisse_operations (caisse);
CREATE INDEX IF NOT EXISTS idx_caisse_parent ON caisse_operations (parent_id);

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

-- Caisse: associés
CREATE TABLE IF NOT EXISTS caisse_associes (
  id BIGSERIAL PRIMARY KEY,
  nom VARCHAR(100) NOT NULL,
  pct DECIMAL(5,2) NOT NULL DEFAULT 0,
  actif BOOLEAN DEFAULT TRUE
);

-- Caisse: avances sur bénéfices
CREATE TABLE IF NOT EXISTS caisse_avances (
  id BIGSERIAL PRIMARY KEY,
  associe_id BIGINT REFERENCES caisse_associes(id),
  montant DECIMAL(12,3) NOT NULL,
  source_caisse VARCHAR(20) NOT NULL CHECK (source_caisse IN ('associes','achats')),
  date_avance DATE NOT NULL,
  rembourse BOOLEAN DEFAULT FALSE,
  date_remboursement DATE,
  note TEXT,
  operation_id BIGINT REFERENCES caisse_operations(id)
);

-- Caisse: bénéfices mensuels
CREATE TABLE IF NOT EXISTS caisse_benefices (
  id BIGSERIAL PRIMARY KEY,
  mois DATE NOT NULL UNIQUE,
  benefice_brut DECIMAL(12,3) DEFAULT 0
);

-- Caisse: détail bénéfice par associé
CREATE TABLE IF NOT EXISTS caisse_benefices_detail (
  id BIGSERIAL PRIMARY KEY,
  benefice_id BIGINT REFERENCES caisse_benefices(id),
  associe_id BIGINT REFERENCES caisse_associes(id),
  part_brute DECIMAL(12,3) DEFAULT 0,
  total_avances DECIMAL(12,3) DEFAULT 0,
  solde_a_payer DECIMAL(12,3) DEFAULT 0
);
