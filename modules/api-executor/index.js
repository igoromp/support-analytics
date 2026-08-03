const express = require('express');
const csv = require('../../core/csv');
const dot = require('../../core/dotnotation');
const storage = require('../../core/storage');
const sharedFiles = require('../../core/shared-files');

const router = express.Router();

// ---------------------------------------------------------------------------
// Cadastro de APIs (persistido em data/config/apis.json — sem banco de dados)
// ---------------------------------------------------------------------------

router.get('/apis', (req, res) => {
  res.json(storage.read('apis', []));
});

function validateApi(body) {
  const { name, method, url } = body || {};
  if (!name || !name.trim()) return 'Informe um nome para a API.';
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return 'Verbo HTTP inválido.';
  if (!url || !/^https?:\/\//i.test(url)) return 'A URL deve começar com http:// ou https://';
  return null;
}

router.post('/apis', (req, res) => {
  const error = validateApi(req.body);
  if (error) return res.status(400).json({ error });
  const apis = storage.read('apis', []);
  const api = {
    id: storage.newId(),
    name: req.body.name.trim(),
    method: req.body.method,
    url: req.body.url.trim(),
    headers: req.body.headers || [],
    query: req.body.query || [],
    bodyTemplate: req.body.bodyTemplate || '',
    hasResponse: req.body.hasResponse !== false,
    createdAt: new Date().toISOString(),
  };
  apis.push(api);
  storage.write('apis', apis);
  res.json(api);
});

router.put('/apis/:id', (req, res) => {
  const error = validateApi(req.body);
  if (error) return res.status(400).json({ error });
  const apis = storage.read('apis', []);
  const idx = apis.findIndex((a) => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'API não encontrada.' });
  apis[idx] = {
    ...apis[idx],
    name: req.body.name.trim(),
    method: req.body.method,
    url: req.body.url.trim(),
    headers: req.body.headers || [],
    query: req.body.query || [],
    bodyTemplate: req.body.bodyTemplate || '',
    hasResponse: req.body.hasResponse !== false,
  };
  storage.write('apis', apis);
  res.json(apis[idx]);
});

router.delete('/apis/:id', (req, res) => {
  const apis = storage.read('apis', []);
  const next = apis.filter((a) => a.id !== req.params.id);
  if (next.length === apis.length) return res.status(404).json({ error: 'API não encontrada.' });
  storage.write('apis', next);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Leitura do arquivo de dados e placeholders
// ---------------------------------------------------------------------------

function loadRecords(file) {
  const text = sharedFiles.readText(file.source, file.name);
  if (/\.json$/i.test(file.name)) {
    const data = JSON.parse(text);
    const items = Array.isArray(data) ? data : null;
    if (!items) throw new Error('O JSON precisa ser um array de objetos para vincular à API.');
    return { records: items, fields: [...dot.collectPaths(items[0] || {})] };
  }
  const parsed = csv.parse(text);
  return { records: csv.toObjects(parsed.headers, parsed.rows), fields: parsed.headers };
}

/** Substitui {{campo}} pelo valor do registro (dot notation para JSON). */
function fillTemplate(template, record, { forUrl = false, jsonContext = false } = {}) {
  return String(template).replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, path) => {
    const value = record ? dot.get(record, path) : undefined;
    if (value === null || value === undefined) return '';
    if (jsonContext && typeof value !== 'object') {
      // dentro de body JSON: insere o valor escapado, sem as aspas externas
      return JSON.stringify(String(value)).slice(1, -1);
    }
    const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return forUrl ? encodeURIComponent(str) : str;
  });
}

router.post('/fields', (req, res) => {
  try {
    const { fields, records } = loadRecords(req.body);
    res.json({ fields, total: records.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Execução com pool de workers
// ---------------------------------------------------------------------------

const jobs = new Map();
const MAX_JOBS = 20;

async function executeCall(api, record, timeoutMs) {
  let url = fillTemplate(api.url, record, { forUrl: true });
  const queryParts = (api.query || [])
    .filter((q) => q.key)
    .map((q) => `${encodeURIComponent(q.key)}=${encodeURIComponent(fillTemplate(q.value, record))}`);
  if (queryParts.length) url += (url.includes('?') ? '&' : '?') + queryParts.join('&');

  const headers = {};
  for (const h of api.headers || []) {
    if (h.key) headers[h.key] = fillTemplate(h.value, record);
  }

  let body;
  if (api.bodyTemplate && !['GET', 'DELETE'].includes(api.method)) {
    body = fillTemplate(api.bodyTemplate, record, { jsonContext: true });
    if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = 'application/json';
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: api.method, headers, body, signal: controller.signal });
    const text = await response.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* resposta não é JSON */ }
    return { status: response.status, ok: response.ok, body: parsed !== null ? parsed : text, url };
  } finally {
    clearTimeout(timer);
  }
}

function extractSaved(responseBody, saveConfig) {
  if (saveConfig.mode !== 'fields') return responseBody;
  const out = {};
  for (const f of saveConfig.fields || []) {
    if (!f.path) continue;
    out[f.rename || f.path] = dot.get(responseBody, f.path);
  }
  return out;
}

router.post('/run', (req, res) => {
  const { apiId, file, workers = 1, timeoutSeconds = 30, save } = req.body || {};
  const api = storage.read('apis', []).find((a) => a.id === apiId);
  if (!api) return res.status(400).json({ error: 'API não encontrada. Cadastre-a primeiro.' });

  let records = [null]; // execução única quando não há arquivo
  try {
    if (file && file.name) records = loadRecords(file).records;
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  if (!records.length) return res.status(400).json({ error: 'O arquivo de dados está vazio.' });

  const workerCount = Math.max(1, Math.min(20, Number(workers) || 1));
  const timeoutMs = Math.max(1, Math.min(300, Number(timeoutSeconds) || 30)) * 1000;

  const job = {
    id: storage.newId(),
    apiName: api.name,
    status: 'running',
    total: records.length,
    done: 0,
    ok: 0,
    failed: 0,
    errors: [],
    savedAs: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  jobs.set(job.id, job);
  while (jobs.size > MAX_JOBS) jobs.delete(jobs.keys().next().value);

  const results = new Array(records.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= records.length) return;
      const record = records[index];
      try {
        const result = await executeCall(api, record, timeoutMs);
        job.ok += result.ok ? 1 : 0;
        job.failed += result.ok ? 0 : 1;
        if (!result.ok) {
          if (job.errors.length < 100) {
            job.errors.push({ index: index + 1, status: result.status, detail: truncate(result.body) });
          }
        }
        results[index] = {
          index: index + 1,
          status: result.status,
          ok: result.ok,
          response: api.hasResponse && save && save.enabled ? extractSaved(result.body, save) : undefined,
        };
      } catch (err) {
        job.failed += 1;
        const detail = err.name === 'AbortError' ? `timeout após ${timeoutMs / 1000}s` : err.message;
        if (job.errors.length < 100) job.errors.push({ index: index + 1, status: 'erro', detail });
        results[index] = { index: index + 1, status: 'erro', ok: false, error: detail };
      } finally {
        job.done += 1;
      }
    }
  }

  Promise.all(Array.from({ length: workerCount }, () => worker()))
    .then(() => {
      if (api.hasResponse && save && save.enabled) {
        const format = save.format === 'txt' ? 'txt' : 'json';
        const baseName = (save.filename && save.filename.trim()) || `api-executor-${api.name}`;
        const outName = baseName.replace(/\.(json|txt)$/i, '') + '.' + format;
        let content;
        if (format === 'json') {
          content = JSON.stringify(results, null, 2);
        } else {
          content = results
            .map((r) => `#${r.index} [${r.status}] ${r.error ? r.error : typeof r.response === 'object' ? JSON.stringify(r.response) : r.response ?? ''}`)
            .join('\n');
        }
        job.savedAs = sharedFiles.writeText('shared', outName, content);
      }
      job.status = 'finished';
      job.finishedAt = new Date().toISOString();
    })
    .catch((err) => {
      job.status = 'error';
      job.errors.push({ index: 0, status: 'fatal', detail: err.message });
      job.finishedAt = new Date().toISOString();
    });

  res.json({ jobId: job.id, total: job.total });
});

function truncate(value) {
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
  return str.length > 300 ? str.slice(0, 300) + '…' : str;
}

router.get('/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job não encontrado.' });
  res.json(job);
});

module.exports = {
  meta: {
    title: 'API Executor',
    description: 'Cadastre APIs e execute chamadas em lote a partir de arquivos CSV/JSON, com workers.',
    order: 5,
    icon: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polyline></svg>`,
  },
  router,
  // funções puras expostas para os testes (o module-loader só lê meta e router)
  internals: { validateApi, fillTemplate, extractSaved },
};
