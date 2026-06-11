const { Pool } = require('pg');

let pool;

function buildConnectionString() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const host = new URL(process.env.SUPABASE_URL).hostname;
    return `postgresql://postgres:${encodeURIComponent(process.env.SUPABASE_SERVICE_ROLE_KEY)}@${host}:6543/postgres?pgbouncer=true`;
  }
  return `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || ''}@${process.env.DB_HOST || 'localhost'}:5432/${process.env.DB_NAME || 'analytics'}`;
}

async function getPool() {
  if (!pool) {
    const connStr = buildConnectionString();
    const isRemote = !connStr.includes('localhost') && !connStr.includes('127.0.0.1');
    pool = new Pool({
      connectionString: connStr,
      max: 5,
      connectionTimeoutMillis: 15000,
      ssl: isRemote ? { rejectUnauthorized: false } : undefined,
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
