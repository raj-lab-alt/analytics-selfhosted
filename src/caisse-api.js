const express = require('express');
const router = express.Router();
const db = require('./db');
const PDFDocument = require('pdfkit');

const CAISSES = ['recettes', 'associes', 'media_buy', 'loyer_charges', 'achats'];
const QUOTA_CAISSES = ['associes', 'media_buy', 'loyer_charges', 'achats'];
const CAISSE_LABELS = { recettes: 'Recettes', associes: 'Associés', media_buy: 'Media Buy', loyer_charges: 'Loyer & Charges', achats: 'Achats' };

function fmtFR(d) {
  if (!d) return '';
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[3] + '/' + m[2] + '/' + m[1] : d;
}
function fmtAmount(n) { return Number(n).toFixed(3); }

function applyFilters(q, query) {
  if (CAISSES.includes(query.caisse)) q = q.eq('caisse', query.caisse);
  if (query.type === 'in' || query.type === 'out') q = q.eq('type', query.type);
  if (query.date_from) q = q.gte('operation_date', query.date_from);
  if (query.date_to) q = q.lte('operation_date', query.date_to);
  return q;
}

async function getQuotas() {
  const { data, error } = await db.getClient().from('caisse_quotas').select('*').order('caisse');
  if (error) throw error;
  const map = {};
  (data || []).forEach(q => { map[q.caisse] = q; });
  return map;
}

async function recalculateQuotas(recetteId, recetteAmount, recetteLibelle) {
  const quotas = await getQuotas();
  const associes = quotas['associes'];
  const children = [];

  if (associes && associes.type === 'formule' && associes.valeur > 0) {
    const colis = null;
    const livreurs = null;
    children.push({ caisse: 'associes', type: 'out', amount: 0, libelle: '' });
  }
  return children;
}

async function createQuotaOps(recetteId, recetteAmount, recetteLibelle, colis, livreurs) {
  const quotas = await getQuotas();
  const ops = [];
  let reste = recetteAmount;

  // Associés (formule fixe)
  const aQuota = quotas['associes'];
  const aVal = aQuota ? parseFloat(aQuota.valeur) : 0;
  let associesAmount = 0;
  if (aQuota && aQuota.type === 'formule' && aVal > 0 && colis && livreurs) {
    associesAmount = colis * livreurs * aVal;
    if (associesAmount > 0) {
      ops.push({
        operation_date: new Date().toISOString().slice(0, 10),
        libelle: 'Quote-part livreurs: ' + recetteLibelle,
        type: 'out',
        amount: associesAmount,
        currency: 'TND',
        caisse: 'associes',
        parent_id: recetteId,
        note: 'Auto (colis=' + colis + ', livreurs=' + livreurs + ', taux=' + aVal + ')',
      });
      reste -= associesAmount;
    }
  }

  // Pourcentages sur le reste
  if (reste > 0) {
    for (const c of QUOTA_CAISSES) {
      if (c === 'associes') continue;
      const q = quotas[c];
      if (!q || q.type !== 'pourcentage') continue;
      const pct = parseFloat(q.valeur);
      if (pct <= 0) continue;
      const amt = reste * pct / 100;
      if (amt > 0) {
        ops.push({
          operation_date: new Date().toISOString().slice(0, 10),
          libelle: 'Quote-part ' + CAISSE_LABELS[c] + ': ' + recetteLibelle,
          type: 'out',
          amount: Math.round(amt * 1000) / 1000,
          currency: 'TND',
          caisse: c,
          parent_id: recetteId,
          note: 'Auto (' + pct + '% de ' + reste + ')',
        });
      }
    }
  }

  return ops;
}

// --- GET /api/caisse/config ---
router.get('/config', async (req, res) => {
  try {
    const { data, error } = await db.getClient().from('caisse_quotas').select('*').order('caisse');
    if (error) throw error;
    const rows = data || [];
    let totalPct = 0;
    rows.forEach(r => { if (r.type === 'pourcentage') totalPct += parseFloat(r.valeur) || 0; });
    res.json({ quotas: rows, total_pourcentage: Math.round(totalPct * 100) / 100 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- PUT /api/caisse/config ---
router.put('/config', async (req, res) => {
  try {
    const updates = req.body;
    if (!Array.isArray(updates)) return res.status(400).json({ error: 'Body must be an array' });
    for (const u of updates) {
      if (!QUOTA_CAISSES.includes(u.caisse)) continue;
      const typ = u.type === 'formule' ? 'formule' : 'pourcentage';
      const val = parseFloat(u.valeur);
      if (isNaN(val) || val < 0) continue;
      const { error } = await db.getClient().from('caisse_quotas').upsert({
        caisse: u.caisse,
        type: typ,
        valeur: typ === 'pourcentage' ? Math.min(val, 100) : val,
      }, { onConflict: 'caisse' });
      if (error) throw error;
    }
    // Re-fetch
    const { data, error } = await db.getClient().from('caisse_quotas').select('*').order('caisse');
    if (error) throw error;
    const rows = data || [];
    let totalPct = 0;
    rows.forEach(r => { if (r.type === 'pourcentage') totalPct += parseFloat(r.valeur) || 0; });
    res.json({ quotas: rows, total_pourcentage: Math.round(totalPct * 100) / 100 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- POST /api/caisse/operations ---
router.post('/operations', async (req, res) => {
  try {
    const b = req.body;
    if (!b.libelle || !b.libelle.trim()) return res.status(400).json({ error: 'Libellé requis' });
    const caisse = b.caisse || 'recettes';
    if (!CAISSES.includes(caisse)) return res.status(400).json({ error: 'Caisse invalide' });
    if (b.type !== 'in' && b.type !== 'out') return res.status(400).json({ error: 'Type invalide' });
    const amt = parseFloat(b.amount);
    if (isNaN(amt) || amt <= 0) return res.status(400).json({ error: 'Montant invalide' });
    const opDate = b.operation_date || new Date().toISOString().slice(0, 10);

    const insertBody = {
      operation_date: opDate,
      libelle: b.libelle.trim(),
      type: b.type,
      amount: amt,
      currency: 'TND',
      caisse,
      payment_method: (b.payment_method || '').trim(),
      reference: (b.reference || '').trim(),
      note: (b.note || '').trim(),
    };

    // Store colis/livreurs for recettes
    if (b.type === 'in' && b.colis !== undefined) insertBody.colis = parseInt(b.colis) || null;
    if (b.type === 'in' && b.livreurs !== undefined) insertBody.livreurs = parseInt(b.livreurs) || null;

    const { data, error } = await db.getClient().from('caisse_operations').insert(insertBody).select();
    if (error) throw error;
    const recette = data[0];

    // Quota logic for recettes
    if (b.type === 'in' && b.appliquer_quotas !== false) {
      const colis = parseInt(b.colis) || 0;
      const livreurs = parseInt(b.livreurs) || 0;
      const quotaOps = await createQuotaOps(recette.id, amt, b.libelle.trim(), colis, livreurs);
      for (const qOp of quotaOps) {
        qOp.operation_date = opDate;
        const { error: qErr } = await db.getClient().from('caisse_operations').insert(qOp);
        if (qErr) console.error('Quota insert error:', qErr.message);
      }
    }

    res.json(recette);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- PUT /api/caisse/operations/:id ---
router.put('/operations/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID invalide' });
    const b = req.body;

    // Fetch existing
    const { data: existing, error: fetchErr } = await db.getClient().from('caisse_operations').select('*').eq('id', id).single();
    if (fetchErr || !existing) return res.status(404).json({ error: 'Introuvable' });

    const upd = {};
    if (b.libelle !== undefined) upd.libelle = b.libelle.trim();
    if (CAISSES.includes(b.caisse)) upd.caisse = b.caisse;
    if (b.type === 'in' || b.type === 'out') upd.type = b.type;
    if (b.amount !== undefined) { const a = parseFloat(b.amount); if (!isNaN(a) && a > 0) upd.amount = a; }
    if (b.operation_date) upd.operation_date = b.operation_date;
    if (b.payment_method !== undefined) upd.payment_method = b.payment_method.trim();
    if (b.reference !== undefined) upd.reference = b.reference.trim();
    if (b.note !== undefined) upd.note = b.note.trim();

    // Store colis/livreurs
    if (b.colis !== undefined) upd.colis = parseInt(b.colis) || null;
    if (b.livreurs !== undefined) upd.livreurs = parseInt(b.livreurs) || null;

    const { data, error } = await db.getClient().from('caisse_operations').update(upd).eq('id', id).select();
    if (error) throw error;
    if (!data || !data.length) return res.status(404).json({ error: 'Introuvable' });

    // If recette with amount/colis/livreurs changed, recalculate children
    const isRecette = existing.type === 'in';
    const amountChanged = upd.amount && upd.amount !== parseFloat(existing.amount);
    const colisChanged = upd.colis !== undefined && upd.colis !== existing.colis;
    const livreursChanged = upd.livreurs !== undefined && upd.livreurs !== existing.livreurs;

    if (isRecette && b.appliquer_quotas !== false && (amountChanged || colisChanged || livreursChanged)) {
      // Delete old children
      await db.getClient().from('caisse_operations').delete().eq('parent_id', id);
      // Recreate with new values
      const newAmount = upd.amount || parseFloat(existing.amount);
      const newColis = upd.colis !== undefined ? upd.colis : existing.colis;
      const newLivreurs = upd.livreurs !== undefined ? upd.livreurs : existing.livreurs;
      const newLibelle = upd.libelle || existing.libelle;
      const newDate = upd.operation_date || existing.operation_date;
      const quotaOps = await createQuotaOps(id, newAmount, newLibelle, newColis, newLivreurs);
      for (const qOp of quotaOps) {
        qOp.operation_date = newDate;
        const { error: qErr } = await db.getClient().from('caisse_operations').insert(qOp);
        if (qErr) console.error('Quota recalc error:', qErr.message);
      }
    }

    res.json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- DELETE /api/caisse/operations/:id ---
router.delete('/operations/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID invalide' });
    // Cascade delete children first
    await db.getClient().from('caisse_operations').delete().eq('parent_id', id);
    const { error } = await db.getClient().from('caisse_operations').delete().eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- GET /api/caisse/operations ---
router.get('/operations', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const perPage = Math.min(200, Math.max(1, parseInt(req.query.per_page) || 20));
    const offset = (page - 1) * perPage;
    let q = db.getClient().from('caisse_operations').select('*');
    q = applyFilters(q, req.query);
    const { data, error } = await q
      .order('operation_date', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + perPage - 1);
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- GET /api/caisse/operations/count ---
router.get('/operations/count', async (req, res) => {
  try {
    let q = db.getClient().from('caisse_operations').select('*', { count: 'exact', head: true });
    q = applyFilters(q, req.query);
    const { count, error } = await q;
    if (error) throw error;
    res.json({ count: count || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- GET /api/caisse/summary ---
router.get('/summary', async (req, res) => {
  try {
    let q = db.getClient().from('caisse_operations').select('caisse, type, amount');
    q = applyFilters(q, req.query);
    const { data, error } = await q;
    if (error) throw error;
    const totals = {};
    (data || []).forEach(r => {
      const c = r.caisse || 'recettes';
      if (!totals[c]) totals[c] = { in: 0, out: 0 };
      const amt = parseFloat(r.amount);
      if (r.type === 'in') totals[c].in += amt;
      else totals[c].out += amt;
    });
    const caisses = {};
    let centralIn = 0, centralOut = 0;
    CAISSES.forEach(c => {
      const t = totals[c] || { in: 0, out: 0 };
      caisses[c] = { in: t.in, out: t.out, balance: t.in - t.out, label: CAISSE_LABELS[c] };
      centralIn += t.in;
      centralOut += t.out;
    });
    res.json({ caisses, central: { in: centralIn, out: centralOut, balance: centralIn - centralOut } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- GET /api/caisse/daily ---
router.get('/daily', async (req, res) => {
  try {
    let q = db.getClient().from('caisse_operations').select('operation_date, type, amount, caisse');
    q = applyFilters(q, req.query);
    const { data, error } = await q;
    if (error) throw error;
    const days = {};
    (data || []).forEach(r => {
      const d = r.operation_date;
      if (!days[d]) days[d] = { day: d, in_total: 0, out_total: 0 };
      const amt = parseFloat(r.amount);
      if (r.type === 'in') days[d].in_total += amt;
      else days[d].out_total += amt;
    });
    res.json(Object.values(days).sort((a, b) => b.day.localeCompare(a.day)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- GET /api/caisse/monthly ---
router.get('/monthly', async (req, res) => {
  try {
    let q = db.getClient().from('caisse_operations').select('operation_date, type, amount, caisse');
    q = applyFilters(q, req.query);
    const { data, error } = await q;
    if (error) throw error;
    const months = {};
    (data || []).forEach(r => {
      const m = r.operation_date.substring(0, 7);
      if (!months[m]) months[m] = { month: m, in_total: 0, out_total: 0 };
      const amt = parseFloat(r.amount);
      if (r.type === 'in') months[m].in_total += amt;
      else months[m].out_total += amt;
    });
    res.json(Object.values(months).sort((a, b) => b.month.localeCompare(a.month)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- GET /api/caisse/chart ---
router.get('/chart', async (req, res) => {
  try {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days) || 30));
    let q = db.getClient().from('caisse_operations').select('operation_date, type, amount, caisse')
      .order('operation_date', { ascending: true });
    q = applyFilters(q, req.query);
    const { data, error } = await q;
    if (error) throw error;

    const dailyNet = {};
    (data || []).forEach(r => {
      const d = r.operation_date;
      if (!dailyNet[d]) dailyNet[d] = 0;
      dailyNet[d] += r.type === 'in' ? parseFloat(r.amount) : -parseFloat(r.amount);
    });

    const today = new Date();
    const series = [];
    let balance = 0;
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - days + 1);
    const startStr = startDate.toISOString().substring(0, 10);
    for (const [d, net] of Object.entries(dailyNet)) {
      if (d < startStr) balance += net;
    }
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - days + 1 + i);
      const key = d.toISOString().substring(0, 10);
      if (dailyNet[key]) balance += dailyNet[key];
      series.push({ date: key, balance: Math.round(balance * 1000) / 1000 });
    }
    res.json(series);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- GET /api/caisse/central ---
router.get('/central', async (req, res) => {
  try {
    const { data, error } = await db.getClient()
      .from('caisse_operations')
      .select('caisse, type, amount');
    if (error) throw error;
    const totals = {};
    (data || []).forEach(r => {
      const c = r.caisse || 'recettes';
      if (!totals[c]) totals[c] = { in: 0, out: 0 };
      const amt = parseFloat(r.amount);
      if (r.type === 'in') totals[c].in += amt;
      else totals[c].out += amt;
    });
    const rows = CAISSES.map(c => ({
      caisse: c,
      label: CAISSE_LABELS[c],
      in: (totals[c] || { in: 0 }).in,
      out: (totals[c] || { out: 0 }).out,
      balance: ((totals[c] || { in: 0, out: 0 }).in - (totals[c] || { in: 0, out: 0 }).out),
    }));
    const central = { in: 0, out: 0, balance: 0 };
    rows.forEach(r => { central.in += r.in; central.out += r.out; central.balance += r.balance; });
    res.json({ rows, central });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- GET /api/caisse/export/csv ---
router.get('/export/csv', async (req, res) => {
  try {
    let q = db.getClient().from('caisse_operations').select('*').order('operation_date', { ascending: false }).order('id', { ascending: false });
    q = applyFilters(q, req.query);
    const { data, error } = await q;
    if (error) throw error;
    const rows = data || [];
    const lines = [];
    lines.push('\uFEFFDate,Libellé,Type,Montant,Devise,Caisse,Mode de paiement,Référence,Note');
    rows.forEach(r => {
      const typeLabel = r.type === 'in' ? 'Entrée' : 'Sortie';
      const note = (r.note || '').replace(/"/g, '""');
      lines.push(`${fmtFR(r.operation_date)},${r.libelle || ''},${typeLabel},${fmtAmount(r.amount)},TND,${CAISSE_LABELS[r.caisse] || r.caisse},${(r.payment_method||'')},${(r.reference||'')},"${note}"`);
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=caisse-export-' + new Date().toISOString().substring(0, 10) + '.csv');
    res.send(lines.join('\r\n'));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- GET /api/caisse/export/pdf ---
router.get('/export/pdf', async (req, res) => {
  try {
    let q = db.getClient().from('caisse_operations').select('*').order('operation_date', { ascending: false }).order('id', { ascending: false });
    q = applyFilters(q, req.query);
    const { data, error } = await q;
    if (error) throw error;
    const rows = data || [];

    const summary = { in: 0, out: 0 };
    rows.forEach(r => { if (r.type === 'in') summary.in += parseFloat(r.amount); else summary.out += parseFloat(r.amount); });
    summary.balance = summary.in - summary.out;

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=caisse-export-' + new Date().toISOString().substring(0, 10) + '.pdf');
    doc.pipe(res);

    doc.fontSize(18).font('Helvetica-Bold').fillColor('#0f7b73').text('Caisse - Export');
    doc.fontSize(9).font('Helvetica').fillColor('#666').text('Généré: ' + new Date().toLocaleString('fr-FR'));
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#333');
    doc.text('Entrées: ' + fmtAmount(summary.in) + '    Sorties: ' + fmtAmount(summary.out) + '    Solde: ' + fmtAmount(summary.balance));
    doc.moveDown(0.5);

    const cols = ['Date', 'Libellé', 'Type', 'Montant', 'Caisse'];
    const colW = [50, 130, 35, 50, 80];
    const rowH = 16;
    let y = doc.y;
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#fff');
    doc.rect(40, y, 495, rowH).fill('#0f7b73');
    let x = 42;
    cols.forEach((c, i) => { doc.text(c, x, y + 4, { width: colW[i] }); x += colW[i]; });
    y += rowH;

    doc.font('Helvetica').fontSize(7.5).fillColor('#333');
    rows.forEach((r, idx) => {
      if (y > 750) {
        doc.addPage(); y = 40;
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#fff');
        doc.rect(40, y, 495, rowH).fill('#0f7b73');
        x = 42;
        cols.forEach((c, i) => { doc.text(c, x, y + 4, { width: colW[i] }); x += colW[i]; });
        y += rowH;
        doc.font('Helvetica').fontSize(7.5).fillColor('#333');
      }
      if (idx % 2 === 0) doc.rect(40, y, 495, rowH).fillOpacity(0.05).fill('#000').fillOpacity(1);
      const vals = [
        fmtFR(r.operation_date),
        (r.libelle || '').substring(0, 40),
        r.type === 'in' ? 'Entrée' : 'Sortie',
        fmtAmount(r.amount),
        CAISSE_LABELS[r.caisse] || r.caisse,
      ];
      x = 42;
      vals.forEach((v, i) => { doc.text(v, x, y + 4, { width: colW[i] }); x += colW[i]; });
      y += rowH;
    });
    doc.end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
