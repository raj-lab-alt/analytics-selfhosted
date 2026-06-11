const { createClient } = require('@supabase/supabase-js');

let supabase;

function getClient() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
    try {
      const ws = require('ws');
      supabase = createClient(url, key, { realtime: { transport: ws } });
    } catch (e) {
      supabase = createClient(url, key);
    }
  }
  return supabase;
}

async function query(sql, params) {
  throw new Error('Raw SQL not supported via Supabase REST API.');
}

module.exports = { getClient, query };
