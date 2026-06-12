require('dotenv').config();
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.DATABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_KEY in .env');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

const csvPath = process.argv[2] || 'D:/caisseplugin/caisse-export-20260612-084852.csv';
const raw = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
const lines = raw.split(/\r?\n/).filter(Boolean);
const header = lines[0]; // Date,Type,Montant,Devise,Mode de paiement,Reference,Note

const batch = [];
for (let i = 1; i < lines.length; i++) {
  const parts = parseCSVLine(lines[i]);
  if (parts.length < 3) continue;
  const [dateStr, typeStr, amountStr, currencyStr, paymentStr, refStr, noteStr] = parts;
  const date = parseFRDate(dateStr);
  if (!date) {
    console.warn('Skip line ' + (i + 1) + ': invalid date "' + dateStr + '"');
    continue;
  }
  const type = typeStr.trim().toLowerCase() === 'entree' ? 'in' : 'out';
  const amount = parseFloat(amountStr.replace(',', '.'));
  if (isNaN(amount) || amount <= 0) {
    console.warn('Skip line ' + (i + 1) + ': invalid amount "' + amountStr + '"');
    continue;
  }
  batch.push({
    operation_date: date,
    type,
    amount,
    currency: (currencyStr || 'TND').trim().toUpperCase().substring(0, 3),
    payment_method: (paymentStr || '').trim(),
    reference: (refStr || '').trim(),
    note: (noteStr || '').trim(),
  });
}

async function main() {
  console.log('Importing ' + batch.length + ' operations...');
  const chunkSize = 50;
  for (let i = 0; i < batch.length; i += chunkSize) {
    const chunk = batch.slice(i, i + chunkSize);
    const { error } = await supabase.from('caisse_operations').insert(chunk);
    if (error) {
      console.error('Error at chunk ' + i + ':', error.message);
    } else {
      console.log('Inserted ' + chunk.length + ' rows (offset ' + i + ')');
    }
  }
  console.log('Done.');
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseFRDate(str) {
  const m = str.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [_, d, mon, y] = m;
  return y + '-' + mon.padStart(2, '0') + '-' + d.padStart(2, '0');
}

main().catch(console.error);
