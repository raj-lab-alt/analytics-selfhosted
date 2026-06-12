const sql = `
CREATE TABLE IF NOT EXISTS caisse_quotas (
  id SERIAL PRIMARY KEY,
  caisse VARCHAR(20) NOT NULL UNIQUE,
  type VARCHAR(15) NOT NULL DEFAULT 'pourcentage' CHECK (type IN ('pourcentage','formule')),
  valeur DECIMAL(10,2) NOT NULL DEFAULT 0,
  valeur2 DECIMAL(10,2) DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);
INSERT INTO caisse_quotas (caisse, type, valeur, valeur2) VALUES
  ('associes','formule',1.00,0),
  ('media_buy','pourcentage',20.00,NULL),
  ('loyer_charges','pourcentage',10.00,NULL),
  ('achats','pourcentage',40.00,NULL)
ON CONFLICT (caisse) DO NOTHING;
ALTER TABLE caisse_quotas ADD COLUMN IF NOT EXISTS valeur2 DECIMAL(10,2) DEFAULT NULL;
ALTER TABLE caisse_operations ADD COLUMN IF NOT EXISTS parent_id BIGINT DEFAULT NULL;
ALTER TABLE caisse_operations ADD COLUMN IF NOT EXISTS colis INT DEFAULT NULL;
ALTER TABLE caisse_operations ADD COLUMN IF NOT EXISTS livreurs INT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_caisse_parent ON caisse_operations (parent_id);
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
