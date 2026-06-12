const sql = `
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
ALTER TABLE caisse_quotas ADD COLUMN IF NOT EXISTS valeur2 DECIMAL(10,2) DEFAULT NULL;
ALTER TABLE caisse_quotas ADD COLUMN IF NOT EXISTS valeur3 DECIMAL(10,2) DEFAULT NULL;
ALTER TABLE caisse_operations ADD COLUMN IF NOT EXISTS parent_id BIGINT DEFAULT NULL;
ALTER TABLE caisse_operations ADD COLUMN IF NOT EXISTS colis INT DEFAULT NULL;
ALTER TABLE caisse_operations ADD COLUMN IF NOT EXISTS livreurs INT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_caisse_parent ON caisse_operations (parent_id);
CREATE TABLE IF NOT EXISTS caisse_associes (
  id BIGSERIAL PRIMARY KEY,
  nom VARCHAR(100) NOT NULL,
  pct DECIMAL(5,2) NOT NULL DEFAULT 0,
  actif BOOLEAN DEFAULT TRUE
);
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
CREATE TABLE IF NOT EXISTS caisse_benefices (
  id BIGSERIAL PRIMARY KEY,
  mois DATE NOT NULL UNIQUE,
  benefice_brut DECIMAL(12,3) DEFAULT 0
);
CREATE TABLE IF NOT EXISTS caisse_benefices_detail (
  id BIGSERIAL PRIMARY KEY,
  benefice_id BIGINT REFERENCES caisse_benefices(id),
  associe_id BIGINT REFERENCES caisse_associes(id),
  part_brute DECIMAL(12,3) DEFAULT 0,
  total_avances DECIMAL(12,3) DEFAULT 0,
  solde_a_payer DECIMAL(12,3) DEFAULT 0
);
`;

async function runMigration() {
  // Try pg direct first
  try {
    const { Client } = require('pg');
    const url = process.env.DATABASE_URL;
    const srKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    if (url && url.includes('supabase.co')) {
      const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
      await client.connect();
      await client.query(sql);
      await client.end();
      console.log('Migration OK (pg direct)');
      return;
    }
    // If DATABASE_URL doesn't have supabase.co, try constructing from SUPABASE_URL
    if (supabaseUrl && srKey) {
      const ref = supabaseUrl.replace('https://', '').split('.')[0];
      try {
        const client = new Client({ host: 'db.' + ref + '.supabase.co', port: 5432, database: 'postgres', user: 'postgres', password: srKey, ssl: { rejectUnauthorized: false } });
        await client.connect();
        await client.query(sql);
        await client.end();
        console.log('Migration OK (pg direct)');
        return;
      } catch(e2) {}
    }
  } catch (e) {
    // pg not available or connect failed
  }

  // Try management API with service_role key
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && key) {
      const ref = supabaseUrl.replace('https://', '').split('.')[0];
      const res = await fetch('https://api.supabase.com/v1/projects/' + ref + '/database/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ query: sql }),
      });
      if (res.ok) { console.log('Migration OK (mgmt API)'); return; }
    }
  } catch (e) {
    // mgmt API not available
  }

  console.log('Auto-migration not possible — run SQL manually in Supabase dashboard (see /install)');
}

module.exports = { runMigration, migrationSql: sql };
