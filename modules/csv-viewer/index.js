const express = require('express');
const csv = require('../../core/csv');
const sharedFiles = require('../../core/shared-files');
const { newId } = require('../../core/storage');

const router = express.Router();

// Sessões de visualização em memória (CSV parseado uma única vez por arquivo aberto).
const sessions = new Map();
const MAX_SESSIONS = 8;

router.post('/open', (req, res) => {
  const { source, name } = req.body || {};
  if (!source || !name) return res.status(400).json({ error: 'Informe o arquivo (source e name).' });

  const text = sharedFiles.readText(source, name);
  const parsed = csv.parse(text);

  const id = newId();
  sessions.set(id, { headers: parsed.headers, rows: parsed.rows, name });
  while (sessions.size > MAX_SESSIONS) {
    sessions.delete(sessions.keys().next().value);
  }

  res.json({ session: id, headers: parsed.headers, total: parsed.rows.length, delimiter: parsed.delimiter });
});

router.post('/page', (req, res) => {
  const { session, page = 1, pageSize = 25, global = '', columnFilters = {} } = req.body || {};
  const data = sessions.get(session);
  if (!data) return res.status(410).json({ error: 'Sessão expirada. Abra o arquivo novamente.' });

  let rows = data.rows;

  const colEntries = Object.entries(columnFilters)
    .map(([idx, term]) => [Number(idx), String(term).toLowerCase()])
    .filter(([, term]) => term !== '');
  if (colEntries.length) {
    rows = rows.filter((row) =>
      colEntries.every(([idx, term]) => String(row[idx] ?? '').toLowerCase().includes(term))
    );
  }

  const g = String(global).toLowerCase();
  if (g) {
    rows = rows.filter((row) => row.some((cell) => String(cell ?? '').toLowerCase().includes(g)));
  }

  const total = rows.length;
  const size = Math.max(1, Math.min(1000, Number(pageSize)));
  const start = (Math.max(1, Number(page)) - 1) * size;

  res.json({ total, rows: rows.slice(start, start + size) });
});

module.exports = {
  meta: {
    title: 'CSV Viewer',
    description: 'Visualize arquivos CSV com paginação, busca por coluna e filtro geral.',
    order: 2,
    icon: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line><line x1="9" y1="3" x2="9" y2="21"></line></svg>`,
  },
  router,
};
