CREATE DATABASE IF NOT EXISTS analytics CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE analytics;

CREATE TABLE IF NOT EXISTS sites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  domain VARCHAR(255) NOT NULL,
  api_key VARCHAR(32) NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS raw_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  site_id INT NOT NULL,
  api_key VARCHAR(32) NOT NULL,
  page VARCHAR(500) NOT NULL,
  referrer VARCHAR(500) DEFAULT '',
  ua TEXT,
  ip_hash VARCHAR(64) DEFAULT '',
  country VARCHAR(4) DEFAULT '',
  city VARCHAR(100) DEFAULT '',
  screen_w INT DEFAULT 0,
  screen_h INT DEFAULT 0,
  session_id VARCHAR(36) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_site_created (site_id, created_at),
  INDEX idx_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS heatmap_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  site_id INT NOT NULL,
  page_url VARCHAR(500) NOT NULL,
  x SMALLINT NOT NULL,
  y SMALLINT NOT NULL,
  viewport_w SMALLINT NOT NULL,
  viewport_h SMALLINT NOT NULL,
  scroll_y SMALLINT DEFAULT 0,
  event_type ENUM('click','move','scroll') NOT NULL,
  session_id VARCHAR(36) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_site_page (site_id, page_url(255)),
  INDEX idx_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS active_sessions (
  session_id VARCHAR(36) PRIMARY KEY,
  site_id INT NOT NULL,
  page VARCHAR(500) DEFAULT '',
  referrer VARCHAR(500) DEFAULT '',
  country VARCHAR(4) DEFAULT '',
  city VARCHAR(100) DEFAULT '',
  ua TEXT,
  last_ping DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_site (site_id),
  INDEX idx_last_ping (last_ping)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stats_hourly (
  id INT AUTO_INCREMENT PRIMARY KEY,
  site_id INT NOT NULL,
  heure DATETIME NOT NULL,
  pages_vues INT DEFAULT 0,
  visiteurs INT DEFAULT 0,
  sessions INT DEFAULT 0,
  bounce INT DEFAULT 0,
  top_pages JSON,
  top_sources JSON,
  UNIQUE KEY uk_site_heure (site_id, heure)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stats_daily (
  id INT AUTO_INCREMENT PRIMARY KEY,
  site_id INT NOT NULL,
  jour DATE NOT NULL,
  pages_vues INT DEFAULT 0,
  visiteurs INT DEFAULT 0,
  sessions INT DEFAULT 0,
  bounce INT DEFAULT 0,
  duree_moyenne FLOAT DEFAULT 0,
  top_pages JSON,
  top_sources JSON,
  UNIQUE KEY uk_site_jour (site_id, jour)
) ENGINE=InnoDB;
