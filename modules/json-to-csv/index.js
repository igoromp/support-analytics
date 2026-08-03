const express = require('express');
const csv = require('../../core/csv');
const dot = require('../../core/dotnotation');
const sharedFiles = require('../../core/shared-files');

const router = express.Router();

/** Localiza o array de itens dentro do JSON (raiz ou via caminho informado). */
function resolveItems(data, arrayPath) {
  if (arrayPath) {
    const target = dot.get(data, arrayPath);
    if (!Array.isArray(target)) throw new Error(`O caminho "${arrayPath}" não aponta para um array.`);
    return target;
  }
  if (Array.isArray(data)) return data;
  throw new Error('O JSON raiz não é um array. Informe o caminho do array em dot notation.');
}

/** Sugere caminhos de arrays no documento (para JSONs cujo array não é a raiz). */
function suggestArrayPaths(data, prefix = '', out = [], depth = 0) {
  if (depth > 4 || data === null || typeof data !== 'object') return out;
  if (Array.isArray(data)) {
    if (prefix) out.push(prefix);
    return out;
  }
  for (const key of Object.keys(data)) {
    suggestArrayPaths(data[key], prefix ? `${prefix}.${key}` : key, out, depth + 1);
  }
  return out;
}

router.post('/preview', (req, res) => {
  const { source, name, arrayPath } = req.body || {};
  if (!source || !name) return res.status(400).json({ error: 'Informe o arquivo (source e name).' });
  try {
    const data = JSON.parse(sharedFiles.readText(source, name));
    const suggestions = Array.isArray(data) ? [] : suggestArrayPaths(data);

    let items = null;
    let fields = [];
    try {
      items = resolveItems(data, arrayPath);
    } catch (err) {
      if (!suggestions.length) throw err;
    }

    if (items) {
      const paths = new Set();
      for (const item of items.slice(0, 50)) dot.collectPaths(item, '', paths);
      fields = [...paths];
    }

    res.json({
      total: items ? items.length : 0,
      fields,
      sample: items ? items.slice(0, 3) : null,
      arraySuggestions: suggestions,
      needsPath: !items,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/convert', (req, res) => {
  const { source, name, arrayPath, fields, delimiter = ',', save, filename } = req.body || {};
  if (!source || !name) return res.status(400).json({ error: 'Informe o arquivo (source e name).' });
  if (!Array.isArray(fields) || fields.length === 0) {
    return res.status(400).json({ error: 'Selecione ao menos um campo para compor o CSV.' });
  }
  try {
    const data = JSON.parse(sharedFiles.readText(source, name));
    const items = resolveItems(data, arrayPath);

    const headers = fields.map((f) => f.rename || f.field);
    const rows = items.map((item) =>
      fields.map(({ field }) => {
        const value = dot.get(item, field);
        if (value === null || value === undefined) return '';
        return typeof value === 'object' ? JSON.stringify(value) : String(value);
      })
    );

    // BOM para o Excel abrir acentuação corretamente
    const content = '﻿' + csv.serialize(headers, rows, { delimiter });

    if (save) {
      const outName = filename && filename.trim() ? filename.trim() : name.replace(/\.json$/i, '') + '.csv';
      const savedAs = sharedFiles.writeText('shared', outName.endsWith('.csv') ? outName : outName + '.csv', content);
      return res.json({ savedAs, total: rows.length });
    }
    res.json({ content, total: rows.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = {
  meta: {
    title: 'JSON → CSV',
    description: 'Converta JSON em CSV navegando pelos campos com dot notation.',
    order: 4,
    icon: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"></path><path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1"></path></svg>`,
  },
  router,
  // funções puras expostas para os testes (o module-loader só lê meta e router)
  internals: { resolveItems, suggestArrayPaths },
};
