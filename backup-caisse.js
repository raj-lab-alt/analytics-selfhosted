require('dotenv').config();
const fs = require('fs');
const db = require('./src/db');

async function backup() {
  const client = db.getClient();
  const { data, error } = await client.from('caisse_operations').select('*').order('id', { ascending: true });
  if (error) { console.error('Backup fetch error:', error.message); return; }
  if (!data || !data.length) { console.log('Aucune donnée à sauvegarder.'); return; }

  const headers = Object.keys(data[0]);
  const lines = [headers.join(',')];
  data.forEach(r => {
    lines.push(headers.map(h => {
      const v = r[h];
      if (v === null || v === undefined) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(','));
  });

  const outPath = 'D:\\caisseplugin\\backup-avant-migration.csv';
  fs.writeFileSync(outPath, '\uFEFF' + lines.join('\r\n'), 'utf8');
  console.log('Backup sauvegardé : ' + outPath + ' (' + data.length + ' lignes)');
}

backup().catch(console.error);
