require('dotenv').config();
const { execSync } = require('child_process');

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
`;

async function openSupabaseSQLEditor() {
  const encoded = encodeURIComponent(sql);
  const url = 'https://supabase.com/dashboard/project/aupxallaghkovsauwgcz/sql/new?content=' + encoded;
  try {
    execSync('start "" "' + url + '"', { shell: 'powershell', timeout: 5000 });
    console.log('Opening Supabase SQL Editor...');
  } catch (e) {
    console.log('Open this URL manually:\n' + url);
  }
}

async function run() {
  // Try direct pg with service_role key as password
  const supabaseUrl = process.env.SUPABASE_URL;
  const srKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && srKey) {
    const ref = supabaseUrl.replace('https://', '').split('.')[0];
    const host = 'db.' + ref + '.supabase.co';
    try {
      const { Client } = require('pg');
      const client = new Client({
        host, port: 5432, database: 'postgres', user: 'postgres', password: srKey,
        ssl: { rejectUnauthorized: false },
      });
      await client.connect();
      await client.query(sql);
      await client.end();
      console.log('Migration OK via pg');
      return;
    } catch (e) {
      console.log('pg direct: ' + e.message.substring(0, 80));
    }
    // Try pooler
    try {
      const { Client } = require('pg');
      const client = new Client({
        host: 'aws-0-eu-central-1.pooler.supabase.com', port: 6543,
        database: 'postgres', user: 'postgres.' + ref, password: srKey,
        ssl: { rejectUnauthorized: false },
      });
      await client.connect();
      await client.query(sql);
      await client.end();
      console.log('Migration OK via pooler');
      return;
    } catch (e) {
      console.log('pg pooler: ' + e.message.substring(0, 80));
    }
  }
  openSupabaseSQLEditor();
}
run().catch(e => console.error(e));
