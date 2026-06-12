require('dotenv').config();
const db = require('./src/db');

const AUX_CAISSES = ['associes', 'media_buy', 'loyer_charges', 'achats'];
const CAISSE_LABELS = { recettes: 'Recettes', associes: 'Associés', media_buy: 'Media Buy', loyer_charges: 'Loyer & Charges', achats: 'Achats' };

async function migrate() {
  const client = db.getClient();

  // 1) Récupérer les totaux OUT par caisse auxiliaire
  const { data: all, error } = await client.from('caisse_operations').select('caisse, type, amount');
  if (error) { console.error('Fetch error:', error.message); return; }

  const totals = {};
  (all || []).forEach(r => {
    const c = r.caisse;
    if (!totals[c]) totals[c] = { in: 0, out: 0 };
    const amt = parseFloat(r.amount) || 0;
    if (r.type === 'in') totals[c].in += amt;
    else totals[c].out += amt;
  });

  // 2) Rapport avant migration
  console.log('=== RAPPORT AVANT MIGRATION ===\n');
  let grandTotalOut = 0;
  for (const c of [...Object.keys(totals)].sort()) {
    const t = totals[c] || { in: 0, out: 0 };
    const bal = t.in - t.out;
    console.log(`  ${(CAISSE_LABELS[c] || c).padEnd(15)}  IN: ${t.in.toFixed(3).padStart(10)}  OUT: ${t.out.toFixed(3).padStart(10)}  Solde: ${bal.toFixed(3).padStart(10)}`);
  }

  // 3) Créer les allocations
  const opsToInsert = [];
  let totalAllAllocations = 0;

  for (const c of AUX_CAISSES) {
    const t = totals[c] || { in: 0, out: 0 };
    const totalOut = t.out;
    if (totalOut <= 0) {
      console.log(`\n  ${CAISSE_LABELS[c]}: pas de dépenses, ignoré`);
      continue;
    }
    // Déjà un IN existant ? calculer ce qui manque
    const existingIn = t.in;
    const manque = totalOut - existingIn;
    if (manque <= 0) {
      console.log(`\n  ${CAISSE_LABELS[c]}: déjà équilibré (IN=${existingIn.toFixed(3)} >= OUT=${totalOut.toFixed(3)})`);
      continue;
    }

    console.log(`\n  ${CAISSE_LABELS[c]}: OUT=${totalOut.toFixed(3)}, IN existant=${existingIn.toFixed(3)}, allocation nécessaire=${manque.toFixed(3)}`);

    opsToInsert.push({
      operation_date: new Date().toISOString().slice(0, 10),
      libelle: 'Allocation archive ' + CAISSE_LABELS[c],
      type: 'in',
      amount: Math.round(manque * 1000) / 1000,
      currency: 'TND',
      caisse: c,
      note: 'Migration archive (équilibrage)',
    });
    totalAllAllocations += manque;
  }

  if (opsToInsert.length === 0) {
    console.log('\n  Aucune allocation nécessaire — toutes les caisses sont équilibrées.');
    return;
  }

  // Ajouter le OUT sur recettes
  if (totalAllAllocations > 0) {
    opsToInsert.push({
      operation_date: new Date().toISOString().slice(0, 10),
      libelle: 'Allocations archives: toutes caisses',
      type: 'out',
      amount: Math.round(totalAllAllocations * 1000) / 1000,
      currency: 'TND',
      caisse: 'recettes',
      note: 'Migration archive (total alloué)',
    });
  }

  // 4) Afficher le résumé et demander confirmation
  console.log('\n=== OPÉRATIONS À INSÉRER ===\n');
  opsToInsert.forEach(o => {
    const typeLabel = o.type === 'in' ? 'IN ' : 'OUT';
    console.log(`  ${typeLabel}  ${(CAISSE_LABELS[o.caisse] || o.caisse).padEnd(15)}  ${o.amount.toFixed(3).padStart(10)}  ${o.libelle}`);
  });
  console.log(`\n  Total alloué aux caisses auxiliaires : ${totalAllAllocations.toFixed(3)} TND`);
  console.log(`  Corresponding OUT sur recettes       : ${totalAllAllocations.toFixed(3)} TND`);

  console.log('\nInsertion en cours...');

  // 5) Insérer
  for (const op of opsToInsert) {
    const { error: insErr } = await client.from('caisse_operations').insert(op);
    if (insErr) console.error('  Erreur insertion:', insErr.message, JSON.stringify(op));
    else console.log(`  ✓ ${op.type} ${CAISSE_LABELS[op.caisse]} ${op.amount.toFixed(3)}`);
  }

  // 6) Vérification finale
  console.log('\n=== VÉRIFICATION FINALE ===\n');
  const { data: check } = await client.from('caisse_operations').select('caisse, type, amount');
  const checkTotals = {};
  (check || []).forEach(r => {
    const c = r.caisse;
    if (!checkTotals[c]) checkTotals[c] = { in: 0, out: 0 };
    const amt = parseFloat(r.amount) || 0;
    if (r.type === 'in') checkTotals[c].in += amt;
    else checkTotals[c].out += amt;
  });
  let centralIn = 0, centralOut = 0;
  for (const c of [...Object.keys(checkTotals)].sort()) {
    const t = checkTotals[c] || { in: 0, out: 0 };
    const bal = t.in - t.out;
    centralIn += t.in;
    centralOut += t.out;
    console.log(`  ${(CAISSE_LABELS[c] || c).padEnd(15)}  IN: ${t.in.toFixed(3).padStart(10)}  OUT: ${t.out.toFixed(3).padStart(10)}  Solde: ${bal.toFixed(3).padStart(10)}`);
  }
  console.log(`  ${'CENTRALE'.padEnd(15)}  IN: ${centralIn.toFixed(3).padStart(10)}  OUT: ${centralOut.toFixed(3).padStart(10)}  Solde: ${(centralIn - centralOut).toFixed(3).padStart(10)}`);

  console.log('\n✓ Migration terminée.');
  console.log('  Pour revenir en arrière : réimporter D:\\caisseplugin\\backup-avant-migration.csv');
  console.log('  Ou supprimer les lignes avec note = "Migration archive (équilibrage)" ou "Migration archive (total alloué)"');
}

migrate().catch(console.error);
