const express = require('express');
const csv = require('../../core/csv');
const dot = require('../../core/dotnotation');
const sharedFiles = require('../../core/shared-files');

const router = express.Router();

router.post('/preview', (req, res) => {
  const { source, name } = req.body || {};
  if (!source || !name) return res.status(400).json({ error: 'Informe o arquivo (source e name).' });
  const parsed = csv.parse(sharedFiles.readText(source, name));
  res.json({
    headers: parsed.headers,
    rows: parsed.rows.slice(0, 10),
    total: parsed.rows.length,
    hasDotNotation: parsed.headers.some((h) => h.includes('.')),
  });
});

function castFixed(type, raw) {
  if (type === 'number') {
    const n = Number(raw);
    if (Number.isNaN(n)) throw new Error(`Valor fixo "${raw}" não é um número válido.`);
    return n;
  }
  if (type === 'boolean') return String(raw).toLowerCase() === 'true';
  return String(raw);
}

router.post('/convert', (req, res) => {
  const { source, name, fields, fixedFields = [], nested = false, save, filename } = req.body || {};
  if (!source || !name) return res.status(400).json({ error: 'Informe o arquivo (source e name).' });
  if (!Array.isArray(fields) || fields.length === 0) {
    return res.status(400).json({ error: 'Selecione ao menos um campo para compor o JSON.' });
  }

  let parsed;
  let fixed;
  try {
    parsed = csv.parse(sharedFiles.readText(source, name));
    fixed = fixedFields
      .filter((f) => f.name)
      .map((f) => ({ name: f.name, value: castFixed(f.type || 'string', f.value) }));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const headerIndex = new Map(parsed.headers.map((h, idx) => [h, idx]));

  const items = parsed.rows.map((row) => {
    const flat = {};
    for (const { field, rename } of fields) {
      const idx = headerIndex.get(field);
      flat[rename || field] = idx === undefined ? '' : row[idx] ?? '';
    }
    for (const f of fixed) flat[f.name] = f.value;
    return nested ? dot.unflatten(flat) : flat;
  });

  const content = JSON.stringify(items, null, 2);

  if (save) {
    const outName = filename && filename.trim() ? filename.trim() : name.replace(/\.csv$/i, '') + '.json';
    const savedAs = sharedFiles.writeText('shared', outName.endsWith('.json') ? outName : outName + '.json', content);
    return res.json({ savedAs, total: items.length });
  }
  res.json({ content, total: items.length });
});

module.exports = {
  meta: {
    title: 'CSV → JSON',
    description: 'Converta CSV em JSON escolhendo campos, renomeando e adicionando campos fixos.',
    order: 3,
    icon: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line></svg>`,
  },
  router,
  // funções puras expostas para os testes (o module-loader só lê meta e router)
  internals: { castFixed },
};
