const { createClient } = require('@supabase/supabase-js');

let supabase;

function getClient() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
    supabase = createClient(url, key);
  }
  return supabase;
}

async function query(sql, params) {
  throw new Error('Raw SQL not supported via Supabase REST API. Use db.query() only for install.');
}

module.exports = { getClient, query };
