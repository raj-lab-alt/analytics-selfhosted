const { Pool } = require('pg');

let pool;

function buildConnectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const host = new URL(process.env.SUPABASE_URL).hostname;
    return `postgresql://postgres:${process.env.SUPABASE_SERVICE_ROLE_KEY}@${host}:5432/postgres`;
  }
  return `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || ''}@${process.env.DB_HOST || 'localhost'}:5432/${process.env.DB_NAME || 'analytics'}`;
}

async function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: buildConnectionString(),
      max: 10,
    });
  }
  return pool;
}

async function query(sql, params) {
  const p = await getPool();
  const result = await p.query(sql, params);
  return result.rows;
}

async function insert(sql, params) {
  const p = await getPool();
  const result = await p.query(sql, params);
  return result;
}

module.exports = { query, insert, getPool };
