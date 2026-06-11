ALTER TABLE raw_events ADD COLUMN IF NOT EXISTS event_type VARCHAR(10) DEFAULT 'pageview';
ALTER TABLE raw_events ALTER COLUMN api_key SET DEFAULT '';
ALTER TABLE raw_events ALTER COLUMN api_key DROP NOT NULL;
ALTER TABLE active_sessions ADD COLUMN IF NOT EXISTS city VARCHAR(100) DEFAULT '';
ALTER TABLE active_sessions ADD COLUMN IF NOT EXISTS lat REAL DEFAULT 0;
ALTER TABLE active_sessions ADD COLUMN IF NOT EXISTS lon REAL DEFAULT 0;
ALTER TABLE active_sessions ADD COLUMN IF NOT EXISTS started_at TIMESTAMP DEFAULT NOW();
ALTER TABLE raw_events ADD COLUMN IF NOT EXISTS traffic_source VARCHAR(10) DEFAULT '';
ALTER TABLE raw_events ADD COLUMN IF NOT EXISTS utm_source VARCHAR(100) DEFAULT '';
ALTER TABLE raw_events ADD COLUMN IF NOT EXISTS utm_medium VARCHAR(100) DEFAULT '';
ALTER TABLE raw_events ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(200) DEFAULT '';
ALTER TABLE heatmap_events ADD COLUMN IF NOT EXISTS x_ratio REAL DEFAULT 0;
ALTER TABLE heatmap_events ADD COLUMN IF NOT EXISTS y_ratio REAL DEFAULT 0;
ALTER TABLE heatmap_events ADD COLUMN IF NOT EXISTS doc_height REAL DEFAULT 0;
ALTER TABLE heatmap_events ALTER COLUMN event_type DROP CONSTRAINT IF EXISTS heatmap_events_event_type_check;
ALTER TABLE heatmap_events ADD CONSTRAINT heatmap_events_event_type_check CHECK (event_type IN ('click','move','touch','scroll'));

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

ALTER TABLE active_sessions ADD COLUMN IF NOT EXISTS visitor_id VARCHAR(36) DEFAULT '';
ALTER TABLE active_sessions ADD COLUMN IF NOT EXISTS device_type VARCHAR(10) DEFAULT '';
ALTER TABLE active_sessions ADD COLUMN IF NOT EXISTS utm_source VARCHAR(100) DEFAULT '';
ALTER TABLE active_sessions ADD COLUMN IF NOT EXISTS utm_medium VARCHAR(100) DEFAULT '';
ALTER TABLE active_sessions ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(200) DEFAULT '';