require('dotenv').config();
const db = require('./src/db');
const CAISSES = ['recettes', 'associes', 'media_buy', 'loyer_charges', 'achats'];

async function migrate() {
  console.log('Migration: correction des écritures quota archive...\n');

  // 1) Récupérer toutes les lignes quota (parent_id non null, caisse != recettes)
  const { data: children, error: fetchErr } = await db.getClient()
    .from('caisse_operations')
    .select('*')
    .not('parent_id', 'is', null);

  if (fetchErr) { console.error('Fetch error:', fetchErr); return; }
  if (!children || !children.length) { console.log('Aucune écriture quota à corriger.'); return; }

  const quotaLines = children.filter(r => r.caisse !== 'recettes');
  console.log(`Trouvé ${quotaLines.length} lignes quota à corriger (caisse != recettes)`);

  // 2) Grouper par parent_id pour connaître le total distribué par recette
  const groups = {};
  for (const r of quotaLines) {
    if (!groups[r.parent_id]) groups[r.parent_id] = [];
    groups[r.parent_id].push(r);
  }

  // 3) Pour chaque groupe : UPDATE type='in' sur les enfants, INSERT OUT sur recettes
  let updated = 0, inserted = 0;
  for (const [parentId, lines] of Object.entries(groups)) {
    // Changer type 'out' → 'in' pour toutes les lignes quota
    for (const line of lines) {
      if (line.type === 'out') {
        const { error: updErr } = await db.getClient()
          .from('caisse_operations')
          .update({ type: 'in' })
          .eq('id', line.id);
        if (updErr) console.error(`  Erreur update id=${line.id}:`, updErr.message);
        else { updated++; console.log(`  id=${line.id} ${line.caisse}: out → in`); }
      } else {
        console.log(`  id=${line.id} ${line.caisse}: déjà 'in', ignoré`);
      }
    }

    // Calculer le total distribué pour cette recette
    const totalDistributed = lines.reduce((s, l) => s + parseFloat(l.amount), 0);
    if (totalDistributed <= 0) continue;

    // Vérifier s'il existe déjà un OUT recettes pour ce parent_id
    const { data: existingOut } = await db.getClient()
      .from('caisse_operations')
      .select('id')
      .eq('parent_id', parseInt(parentId))
      .eq('caisse', 'recettes')
      .eq('type', 'out');

    if (existingOut && existingOut.length > 0) {
      console.log(`  parent_id=${parentId}: OUT recettes déjà présent (id=${existingOut[0].id}), ignoré`);
      continue;
    }

    // Récupérer la recette parente pour la date et le libellé
    const { data: parent } = await db.getClient()
      .from('caisse_operations')
      .select('operation_date, libelle')
      .eq('id', parseInt(parentId))
      .single();

    const opDate = parent ? parent.operation_date : new Date().toISOString().slice(0, 10);
    const libelle = parent ? parent.libelle : '(inconnu)';

    const { error: insErr } = await db.getClient()
      .from('caisse_operations')
      .insert({
        operation_date: opDate,
        libelle: 'Répartition quote-parts (archive): ' + libelle,
        type: 'out',
        amount: Math.round(totalDistributed * 1000) / 1000,
        currency: 'TND',
        caisse: 'recettes',
        parent_id: parseInt(parentId),
        note: 'Migration archive (total distribué)',
      });
    if (insErr) console.error(`  Erreur insert OUT recettes pour parent_id=${parentId}:`, insErr.message);
    else { inserted++; console.log(`  parent_id=${parentId}: OUT recettes ${totalDistributed.toFixed(3)} TND inséré`); }
  }

  console.log(`\nRésumé : ${updated} lignes corrigées (out→in), ${inserted} OUT recettes ajoutés`);
}

migrate().catch(console.error);
