const express = require('express');
const router = express.Router();
const db = require('./db');
const PDFDocument = require('pdfkit');

// --- Helpers ---

function parseFRDate(str) {
  if (!str) return '';
  const m = str.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  // already ISO
  if (str.match(/^\d{4}-\d{2}-\d{2}$/)) return str;
  return '';
}

function fmtFR(dateStr) {
  if (!dateStr) return '';
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[3] + '/' + m[2] + '/' + m[1];
  return dateStr;
}

function fmtAmount(n) { return Number(n).toFixed(3); }

// --- GET /api/caisse/operations ---
router.get('/operations', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const perPage = Math.min(200, Math.max(1, parseInt(req.query.per_page) || 20));
    const offset = (page - 1) * perPage;
    let q = db.getClient().from('caisse_operations').select('*');
    if (req.query.type === 'in' || req.query.type === 'out') q = q.eq('type', req.query.type);
    if (req.query.date_from) q = q.gte('operation_date', req.query.date_from);
    if (req.query.date_to) q = q.lte('operation_date', req.query.date_to);
    const { data, error } = await q
      .order('operation_date', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + perPage - 1);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- GET /api/caisse/operations/count ---
router.get('/operations/count', async (req, res) => {
  try {
    let query = db.getClient().from('caisse_operations').select('*', { count: 'exact', head: true });
    if (req.query.type === 'in' || req.query.type === 'out') query = query.eq('type', req.query.type);
    if (req.query.date_from) query = query.gte('operation_date', req.query.date_from);
    if (req.query.date_to) query = query.lte('operation_date', req.query.date_to);
    const { count, error } = await query;
    if (error) throw error;
    res.json({ count: count || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- POST /api/caisse/operations ---
router.post('/operations', async (req, res) => {
  try {
    const b = req.body;
    const opDate = parseFRDate(b.operation_date);
    if (!opDate) return res.status(400).json({ error: 'Date invalide' });
    const type = b.type === 'in' ? 'in' : 'out';
    const amount = parseFloat(b.amount);
    if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'Montant invalide' });
    if (!b.currency || !b.currency.trim()) return res.status(400).json({ error: 'Devise requise' });

    const { data, error } = await db.getClient().from('caisse_operations').insert({
      operation_date: opDate,
      type,
      amount,
      currency: b.currency.trim().toUpperCase().substring(0, 3),
      payment_method: (b.payment_method || '').trim(),
      reference: (b.reference || '').trim(),
      note: (b.note || '').trim(),
    }).select();
    if (error) throw error;
    res.json(data[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- PUT /api/caisse/operations/:id ---
router.put('/operations/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID invalide' });
    const b = req.body;
    const update = {};
    if (b.operation_date) { const d = parseFRDate(b.operation_date); if (d) update.operation_date = d; }
    if (b.type === 'in' || b.type === 'out') update.type = b.type;
    if (b.amount !== undefined) { const a = parseFloat(b.amount); if (!isNaN(a) && a > 0) update.amount = a; }
    if (b.currency !== undefined) update.currency = b.currency.trim().toUpperCase().substring(0, 3);
    if (b.payment_method !== undefined) update.payment_method = b.payment_method.trim();
    if (b.reference !== undefined) update.reference = b.reference.trim();
    if (b.note !== undefined) update.note = b.note.trim();

    const { data, error } = await db.getClient().from('caisse_operations').update(update).eq('id', id).select();
    if (error) throw error;
    if (!data || !data.length) return res.status(404).json({ error: 'Opération introuvable' });
    res.json(data[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- DELETE /api/caisse/operations/:id ---
router.delete('/operations/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID invalide' });
    const { error } = await db.getClient().from('caisse_operations').delete().eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- GET /api/caisse/summary ---
router.get('/summary', async (req, res) => {
  try {
    const { where, params } = buildWhere(req.query);
    let q = db.getClient().from('caisse_operations').select('type, amount');
    if (req.query.date_from) q = q.gte('operation_date', req.query.date_from);
    if (req.query.date_to) q = q.lte('operation_date', req.query.date_to);
    const { data, error } = await q;
    if (error) throw error;
    let totalIn = 0, totalOut = 0;
    (data || []).forEach(r => {
      if (r.type === 'in') totalIn += parseFloat(r.amount);
      else totalOut += parseFloat(r.amount);
    });
    res.json({ in: totalIn, out: totalOut, balance: totalIn - totalOut });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- GET /api/caisse/daily ---
router.get('/daily', async (req, res) => {
  try {
    const { data, error } = await buildDailyQuery(req);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

async function buildDailyQuery(req) {
  let q = db.getClient()
    .from('caisse_operations')
    .select('operation_date, type, amount');
  if (req.query.date_from) q = q.gte('operation_date', req.query.date_from);
  if (req.query.date_to) q = q.lte('operation_date', req.query.date_to);
  const { data, error } = await q;
  if (error) return { data: null, error };
  const days = {};
  (data || []).forEach(r => {
    const day = r.operation_date;
    if (!days[day]) days[day] = { day, in_total: 0, out_total: 0 };
    const amt = parseFloat(r.amount);
    if (r.type === 'in') days[day].in_total += amt;
    else days[day].out_total += amt;
  });
  return { data: Object.values(days).sort((a, b) => b.day.localeCompare(a.day)), error: null };
}

// --- GET /api/caisse/monthly ---
router.get('/monthly', async (req, res) => {
  try {
    const { data, error } = await buildDailyQuery(req);
    if (error) throw error;
    const months = {};
    (data || []).forEach(r => {
      const m = r.day.substring(0, 7);
      if (!months[m]) months[m] = { month: m, in_total: 0, out_total: 0 };
      months[m].in_total += r.in_total;
      months[m].out_total += r.out_total;
    });
    res.json(Object.values(months).sort((a, b) => b.month.localeCompare(a.month)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- GET /api/caisse/chart ---
router.get('/chart', async (req, res) => {
  try {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days) || 30));
    const { data, error } = await db.getClient()
      .from('caisse_operations')
      .select('operation_date, type, amount')
      .order('operation_date', { ascending: true });
    if (error) throw error;

    const daily = {};
    (data || []).forEach(r => {
      const d = r.operation_date;
      if (!daily[d]) daily[d] = 0;
      daily[d] += r.type === 'in' ? parseFloat(r.amount) : -parseFloat(r.amount);
    });

    const today = new Date();
    const series = [];
    let balance = 0;
    // Pre-balance: sum everything before the window
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - days + 1);
    const startStr = startDate.toISOString().substring(0, 10);
    for (const [d, net] of Object.entries(daily)) {
      if (d < startStr) balance += net;
    }
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - days + 1 + i);
      const key = d.toISOString().substring(0, 10);
      if (daily[key]) balance += daily[key];
      series.push({ date: key, balance: Math.round(balance * 1000) / 1000 });
    }
    res.json(series);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- GET /api/caisse/export/csv ---
router.get('/export/csv', async (req, res) => {
  try {
    let q = db.getClient().from('caisse_operations').select('*').order('operation_date', { ascending: false }).order('id', { ascending: false });
    if (req.query.type === 'in' || req.query.type === 'out') q = q.eq('type', req.query.type);
    if (req.query.date_from) q = q.gte('operation_date', req.query.date_from);
    if (req.query.date_to) q = q.lte('operation_date', req.query.date_to);
    const { data, error } = await q;
    if (error) throw error;

    const rows = data || [];
    const summary = { in: 0, out: 0 };
    rows.forEach(r => { if (r.type === 'in') summary.in += parseFloat(r.amount); else summary.out += parseFloat(r.amount); });
    summary.balance = summary.in - summary.out;

    const lines = [];
    lines.push('\uFEFFDate,Type,Montant,Devise,Mode de paiement,Reference,Note');
    rows.forEach(r => {
      const typeLabel = r.type === 'in' ? 'Entree' : 'Sortie';
      const note = (r.note || '').replace(/"/g, '""');
      lines.push(`${fmtFR(r.operation_date)},${typeLabel},${fmtAmount(r.amount)},${r.currency},${(r.payment_method||'')},${(r.reference||'')},"${note}"`);
    });
    lines.push('');
    lines.push(`Entrees,,${fmtAmount(summary.in)},Sorties,,${fmtAmount(summary.out)},Solde,,${fmtAmount(summary.balance)}`);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=caisse-export-' + new Date().toISOString().substring(0, 10) + '.csv');
    res.send(lines.join('\r\n'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- GET /api/caisse/export/pdf ---
router.get('/export/pdf', async (req, res) => {
  try {
    let q = db.getClient().from('caisse_operations').select('*').order('operation_date', { ascending: false }).order('id', { ascending: false });
    if (req.query.type === 'in' || req.query.type === 'out') q = q.eq('type', req.query.type);
    if (req.query.date_from) q = q.gte('operation_date', req.query.date_from);
    if (req.query.date_to) q = q.lte('operation_date', req.query.date_to);
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

    // Header
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#0f7b73').text('Caisse - Export', { continued: false });
    doc.fontSize(9).font('Helvetica').fillColor('#666').text('Généré: ' + new Date().toLocaleString('fr-FR'));
    if (req.query.date_from || req.query.date_to) {
      doc.text('Période: ' + (fmtFR(req.query.date_from) || '...') + ' - ' + (fmtFR(req.query.date_to) || '...'));
    }
    doc.moveDown(0.5);

    // Summary
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#333');
    doc.text('Entrées: ' + fmtAmount(summary.in) + '    Sorties: ' + fmtAmount(summary.out) + '    Solde: ' + fmtAmount(summary.balance));
    doc.moveDown(0.5);

    // Table header
    const cols = ['Date', 'Type', 'Montant', 'Devise', 'Mode', 'Réf', 'Note'];
    const colW = [50, 35, 50, 30, 55, 55, 180];
    const tableTop = doc.y;
    const rowH = 16;
    let y = tableTop;

    doc.fontSize(8).font('Helvetica-Bold').fillColor('#fff');
    doc.rect(40, y, 495, rowH).fill('#0f7b73');
    let x = 42;
    cols.forEach((c, i) => { doc.text(c, x, y + 4, { width: colW[i] }); x += colW[i]; });
    y += rowH;

    // Rows
    doc.font('Helvetica').fontSize(7.5).fillColor('#333');
    rows.forEach((r, idx) => {
      if (y > 750) {
        doc.addPage();
        y = 40;
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
        r.type === 'in' ? 'Entrée' : 'Sortie',
        fmtAmount(r.amount),
        r.currency,
        r.payment_method || '',
        r.reference || '',
        (r.note || '').substring(0, 60),
      ];
      x = 42;
      vals.forEach((v, i) => { doc.text(v, x, y + 4, { width: colW[i] }); x += colW[i]; });
      y += rowH;
    });

    doc.end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
