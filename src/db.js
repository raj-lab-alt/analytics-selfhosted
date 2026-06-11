const { Pool } = require('pg');

let pool;

async function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'analytics',
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
