require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.DATABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_KEY in .env');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

const CAISSES = [
  { file: 'caisse_recettes.csv', caisse: 'recettes' },
  { file: 'caisse_associes.csv', caisse: 'associes' },
  { file: 'caisse_media_buy_new.csv', caisse: 'media_buy' },
  { file: 'caisse_loyer_charges_new.csv', caisse: 'loyer_charges' },
  { file: 'caisse_achats_new.csv', caisse: 'achats' },
];

const dir = process.argv[2] || 'D:\\caisseplugin';

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

function parseFRDate(str) {
  const m = str.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
}

async function importCSV(filePath, caisseName) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) { console.log('Empty: ' + filePath); return []; }

  const batch = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = parseCSVLine(lines[i]);
    if (parts.length < 3) continue;
    const [dateStr, typeStr, amountStr, currencyStr, paymentStr, refStr, noteStr] = parts;
    const date = parseFRDate(dateStr);
    if (!date) { console.warn('Skip ' + filePath + ' line ' + (i + 1) + ': invalid date'); continue; }
    const type = typeStr.trim().toLowerCase() === 'entree' ? 'in' : 'out';
    const amount = parseFloat(amountStr.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) { console.warn('Skip ' + filePath + ' line ' + (i + 1) + ': invalid amount'); continue; }
    batch.push({
      operation_date: date,
      type,
      amount,
      libelle: (noteStr || '').trim(),
      currency: 'TND',
      caisse: caisseName,
      payment_method: (paymentStr || '').trim(),
      reference: (refStr || '').trim(),
      note: (noteStr || '').trim(),
    });
  }
  return batch;
}

async function main() {
  // Clear existing
  console.log('Clearing existing caisse_operations...');
  const { error: delErr } = await supabase.from('caisse_operations').delete().neq('id', 0);
  if (delErr) console.error('Clear error:', delErr.message);

  let total = 0;
  for (const { file, caisse } of CAISSES) {
    const filePath = path.join(dir, file);
    if (!fs.existsSync(filePath)) { console.warn('Not found: ' + filePath); continue; }
    const batch = await importCSV(filePath, caisse);
    console.log(file + ' → ' + batch.length + ' rows');

    const chunkSize = 50;
    for (let i = 0; i < batch.length; i += chunkSize) {
      const chunk = batch.slice(i, i + chunkSize);
      const { error } = await supabase.from('caisse_operations').insert(chunk);
      if (error) console.error('Error at ' + file + ' chunk ' + i + ':', error.message);
    }
    total += batch.length;
  }
  console.log('Done. Total imported: ' + total);
}

main().catch(console.error);
