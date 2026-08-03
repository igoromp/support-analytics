const express = require('express');
const { ServiceBusClient, ServiceBusAdministrationClient } = require('@azure/service-bus');
const csv = require('../../core/csv');
const dot = require('../../core/dotnotation');
const storage = require('../../core/storage');
const sharedFiles = require('../../core/shared-files');

const router = express.Router();

// ---------------------------------------------------------------------------
// Conexões (data/config/servicebus.json) — a connection string nunca volta
// completa para o navegador, apenas mascarada.
// ---------------------------------------------------------------------------

function maskConnection(conn) {
  const endpoint = (conn.connectionString.match(/Endpoint=sb:\/\/([^/;]+)/i) || [])[1] || '?';
  return { id: conn.id, name: conn.name, endpoint };
}

function getConnection(connId) {
  const conn = storage.read('servicebus', []).find((c) => c.id === connId);
  if (!conn) throw new Error('Conexão não encontrada. Cadastre-a primeiro.');
  return conn;
}

router.get('/connections', (req, res) => {
  res.json(storage.read('servicebus', []).map(maskConnection));
});

router.post('/connections', (req, res) => {
  const { name, connectionString } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Informe um nome para a conexão.' });
  if (!connectionString || !/Endpoint=sb:\/\//i.test(connectionString)) {
    return res.status(400).json({ error: 'Connection string inválida (esperado Endpoint=sb://…).' });
  }
  const conns = storage.read('servicebus', []);
  const conn = { id: storage.newId(), name: name.trim(), connectionString: connectionString.trim() };
  conns.push(conn);
  storage.write('servicebus', conns);
  res.json(maskConnection(conn));
});

router.delete('/connections/:id', (req, res) => {
  const conns = storage.read('servicebus', []);
  const next = conns.filter((c) => c.id !== req.params.id);
  if (next.length === conns.length) return res.status(404).json({ error: 'Conexão não encontrada.' });
  storage.write('servicebus', next);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Helpers de entidade / mensagens
// ---------------------------------------------------------------------------

function validateEntity(entity) {
  if (!entity) throw new Error('Informe a fila ou tópico.');
  if (entity.type === 'queue') {
    if (!entity.queue) throw new Error('Informe o nome da fila.');
  } else if (entity.type === 'topic') {
    if (!entity.topic || !entity.subscription) throw new Error('Informe o tópico e a subscription.');
  } else {
    throw new Error('Tipo de entidade inválido (queue ou topic).');
  }
}

function createDlqReceiver(client, entity, receiveMode) {
  const options = { subQueueType: 'deadLetter', receiveMode };
  return entity.type === 'queue'
    ? client.createReceiver(entity.queue, options)
    : client.createReceiver(entity.topic, entity.subscription, options);
}

function createMainSender(client, entity) {
  return client.createSender(entity.type === 'queue' ? entity.queue : entity.topic);
}

function decodeBody(body) {
  if (Buffer.isBuffer(body)) {
    const text = body.toString('utf8');
    try { return { value: JSON.parse(text), isJson: true }; } catch { return { value: text, isJson: false }; }
  }
  if (typeof body === 'string') {
    try { return { value: JSON.parse(body), isJson: true }; } catch { return { value: body, isJson: false }; }
  }
  return { value: body, isJson: typeof body === 'object' && body !== null };
}

function exportShape(msg) {
  const decoded = decodeBody(msg.body);
  return {
    sequenceNumber: msg.sequenceNumber !== undefined ? String(msg.sequenceNumber) : undefined,
    messageId: msg.messageId,
    enqueuedTimeUtc: msg.enqueuedTimeUtc,
    deliveryCount: msg.deliveryCount,
    deadLetterReason: msg.deadLetterReason,
    deadLetterErrorDescription: msg.deadLetterErrorDescription,
    subject: msg.subject,
    contentType: msg.contentType,
    correlationId: msg.correlationId,
    applicationProperties: msg.applicationProperties,
    body: decoded.value,
  };
}

/** Monta a mensagem de reenvio preservando propriedades relevantes da original. */
function buildResendMessage(original, newBodyValue) {
  return {
    body: typeof newBodyValue === 'object' ? JSON.stringify(newBodyValue) : String(newBodyValue),
    contentType: original.contentType || 'application/json',
    correlationId: original.correlationId,
    messageId: original.messageId,
    subject: original.subject,
    sessionId: original.sessionId,
    applicationProperties: original.applicationProperties,
  };
}

async function getDlqCount(conn, entity) {
  const admin = new ServiceBusAdministrationClient(conn.connectionString);
  if (entity.type === 'queue') {
    const props = await admin.getQueueRuntimeProperties(entity.queue);
    return { active: props.activeMessageCount, dlq: props.deadLetterMessageCount };
  }
  const props = await admin.getSubscriptionRuntimeProperties(entity.topic, entity.subscription);
  return { active: props.activeMessageCount, dlq: props.deadLetterMessageCount };
}

// ---------------------------------------------------------------------------
// Teste de conexão
// ---------------------------------------------------------------------------

router.post('/test', async (req, res) => {
  let client;
  try {
    const conn = getConnection(req.body.connId);
    const entity = req.body.entity;
    validateEntity(entity);

    let counts = null;
    try {
      counts = await getDlqCount(conn, entity);
    } catch {
      // sem permissão de manage: valida via peek
      client = new ServiceBusClient(conn.connectionString);
      const receiver = createDlqReceiver(client, entity, 'peekLock');
      await receiver.peekMessages(1);
      await receiver.close();
    }
    res.json({ ok: true, counts });
  } catch (err) {
    res.status(400).json({ error: `Falha na conexão: ${err.message}` });
  } finally {
    if (client) await client.close().catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Leitura por peek — não afeta as mensagens da DLQ
// ---------------------------------------------------------------------------

/** Lê até `max` dead letters sem consumi-las. */
async function peekDlq(client, entity, max) {
  const receiver = createDlqReceiver(client, entity, 'peekLock');
  const messages = [];
  let fromSequenceNumber;
  while (messages.length < max) {
    const batch = await receiver.peekMessages(Math.min(250, max - messages.length), { fromSequenceNumber });
    if (!batch.length) break; // fila esgotada: traz só o que existe
    for (const msg of batch) messages.push(exportShape(msg));
    // sequenceNumber é um Long (biblioteca `long`), não BigInt — o SDK exige
    // esse tipo de volta em fromSequenceNumber.
    fromSequenceNumber = batch[batch.length - 1].sequenceNumber.add(1);
  }
  await receiver.close();
  return messages;
}

/** Listagem para a tela: devolve as mensagens em vez de salvar em arquivo. */
router.post('/peek', async (req, res) => {
  let client;
  try {
    const conn = getConnection(req.body.connId);
    const entity = req.body.entity;
    validateEntity(entity);
    const max = Math.max(1, Math.min(2000, Number(req.body.max) || 200));

    client = new ServiceBusClient(conn.connectionString);
    const messages = await peekDlq(client, entity, max);
    res.json({ total: messages.length, messages });
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    if (client) await client.close().catch(() => {});
  }
});

router.post('/export', async (req, res) => {
  let client;
  try {
    const conn = getConnection(req.body.connId);
    const entity = req.body.entity;
    validateEntity(entity);
    const max = Math.max(1, Math.min(50000, Number(req.body.max) || 100));

    client = new ServiceBusClient(conn.connectionString);
    const messages = await peekDlq(client, entity, max);

    const entityLabel = entity.type === 'queue' ? entity.queue : `${entity.topic}-${entity.subscription}`;
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const savedAs = sharedFiles.writeText(
      'shared',
      `dlq-${entityLabel}-${stamp}.json`.replace(/[^\w.\-()]/g, '_'),
      JSON.stringify(messages, null, 2)
    );
    res.json({ total: messages.length, savedAs });
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    if (client) await client.close().catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Reprocess 1 a 1 (peekLock com renovação automática do lock)
// ---------------------------------------------------------------------------

const held = new Map(); // sessionId → { client, receiver, message, renewTimer }

async function releaseHeld(sessionId, { abandon = true } = {}) {
  const h = held.get(sessionId);
  if (!h) return;
  held.delete(sessionId);
  clearInterval(h.renewTimer);
  try {
    if (abandon && h.message) await h.receiver.abandonMessage(h.message);
  } catch { /* lock pode já ter expirado */ }
  await h.receiver.close().catch(() => {});
  await h.client.close().catch(() => {});
}

router.post('/reprocess/fetch', async (req, res) => {
  let client;
  try {
    const conn = getConnection(req.body.connId);
    const entity = req.body.entity;
    validateEntity(entity);

    client = new ServiceBusClient(conn.connectionString);
    const receiver = createDlqReceiver(client, entity, 'peekLock');
    const [message] = await receiver.receiveMessages(1, { maxWaitTimeInMs: 8000 });
    if (!message) {
      await receiver.close();
      await client.close();
      return res.json({ empty: true });
    }

    const sessionId = storage.newId();
    const renewTimer = setInterval(() => {
      receiver.renewMessageLock(message).catch(() => {});
    }, 20000);
    held.set(sessionId, { client, receiver, message, renewTimer, entity });
    // segurança: libera automaticamente após 10 minutos
    setTimeout(() => releaseHeld(sessionId), 10 * 60 * 1000).unref();

    const decoded = decodeBody(message.body);
    res.json({
      session: sessionId,
      message: exportShape(message),
      bodyIsJson: decoded.isJson,
    });
  } catch (err) {
    if (client) await client.close().catch(() => {});
    res.status(400).json({ error: err.message });
  }
});

router.post('/reprocess/send', async (req, res) => {
  const h = held.get(req.body.session);
  if (!h) return res.status(410).json({ error: 'Sessão expirada — busque a mensagem novamente.' });
  try {
    let newBody = req.body.body;
    if (typeof newBody === 'string') {
      try { newBody = JSON.parse(newBody); } catch { /* mantém como texto puro */ }
    }
    const sender = createMainSender(h.client, h.entity);
    await sender.sendMessages(buildResendMessage(h.message, newBody));
    await sender.close();
    await h.receiver.completeMessage(h.message);
    h.message = null;
    await releaseHeld(req.body.session, { abandon: false });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: `Falha ao reenviar: ${err.message}` });
  }
});

router.post('/reprocess/release', async (req, res) => {
  await releaseHeld(req.body.session);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Reprocess em lote via CSV
// ---------------------------------------------------------------------------

function parseRuleSpec(spec) {
  const idx = String(spec).indexOf(':');
  if (idx === -1) throw new Error(`Regra inválida "${spec}" — use tipo:valor (ex.: number:10, string:csv_2).`);
  const type = spec.slice(0, idx).trim();
  const raw = spec.slice(idx + 1).trim();
  if (!['string', 'number', 'boolean'].includes(type)) {
    throw new Error(`Tipo inválido "${type}" — use string, number ou boolean.`);
  }
  const csvRef = raw.match(/^csv_(\d+)$/i);
  return { type, raw, csvColumn: csvRef ? Number(csvRef[1]) : null };
}

function castValue(type, raw) {
  if (type === 'number') {
    const n = Number(raw);
    if (Number.isNaN(n)) throw new Error(`Valor "${raw}" não é um número válido.`);
    return n;
  }
  if (type === 'boolean') return ['true', '1', 'sim'].includes(String(raw).toLowerCase());
  return String(raw);
}

const jobs = new Map();
const MAX_JOBS = 20;

/**
 * Varre a DLQ recebendo em peekLock e reenvia as mensagens cujo `keyOf` está em
 * `keys`; as demais são abandonadas (voltam intactas). Roda em background e
 * devolve o job, que é acompanhado por GET /jobs/:id.
 *
 * @param keyOf     (bodyDecodificado, msg) → chave da mensagem
 * @param transform (bodyDecodificado, chave) → body a reenviar
 */
function startReprocessJob({ conn, entity, keys, keyOf, transform }) {
  const job = {
    id: storage.newId(),
    status: 'running',
    totalKeys: keys.size,
    matched: 0,
    resent: 0,
    skipped: 0,
    failed: 0,
    scanned: 0,
    errors: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  jobs.set(job.id, job);
  while (jobs.size > MAX_JOBS) jobs.delete(jobs.keys().next().value);

  (async () => {
    const client = new ServiceBusClient(conn.connectionString);
    const receiver = createDlqReceiver(client, entity, 'peekLock');
    const sender = createMainSender(client, entity);
    const seen = new Set();
    const pendingKeys = new Set(keys);

    try {
      while (pendingKeys.size > 0) {
        const batch = await receiver.receiveMessages(20, { maxWaitTimeInMs: 8000 });
        if (!batch.length) break; // DLQ esgotada

        let sawNew = false;
        for (const msg of batch) {
          const seq = String(msg.sequenceNumber);
          if (seen.has(seq)) {
            await receiver.abandonMessage(msg).catch(() => {});
            continue;
          }
          seen.add(seq);
          sawNew = true;
          job.scanned += 1;

          try {
            const decoded = decodeBody(msg.body);
            const key = keyOf(decoded.value, msg);

            if (!key || !pendingKeys.has(key)) {
              job.skipped += 1;
              await receiver.abandonMessage(msg);
              continue;
            }

            job.matched += 1;
            await sender.sendMessages(buildResendMessage(msg, transform(decoded.value, key)));
            await receiver.completeMessage(msg);
            pendingKeys.delete(key);
            job.resent += 1;
          } catch (err) {
            job.failed += 1;
            if (job.errors.length < 100) {
              job.errors.push({ ref: String(msg.messageId || msg.sequenceNumber), detail: err.message });
            }
            await receiver.abandonMessage(msg).catch(() => {});
          }
        }
        if (!sawNew) break; // só mensagens já vistas: evita loop infinito
      }
      job.status = 'finished';
    } catch (err) {
      job.status = 'error';
      job.errors.push({ ref: 'fatal', detail: err.message });
    } finally {
      job.pendingKeys = [...pendingKeys].slice(0, 50);
      job.finishedAt = new Date().toISOString();
      await sender.close().catch(() => {});
      await receiver.close().catch(() => {});
      await client.close().catch(() => {});
    }
  })();

  return job;
}

// ---------------------------------------------------------------------------
// Reprocess das mensagens marcadas na listagem (casadas por sequenceNumber)
// ---------------------------------------------------------------------------

router.post('/reprocess/selected', (req, res) => {
  const { connId, entity, sequenceNumbers } = req.body || {};
  let conn;
  try {
    conn = getConnection(connId);
    validateEntity(entity);
    if (!Array.isArray(sequenceNumbers) || !sequenceNumbers.length) {
      throw new Error('Selecione ao menos uma mensagem.');
    }
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  // reenvio sem alteração: o body volta exatamente como está na DLQ
  const job = startReprocessJob({
    conn,
    entity,
    keys: new Set(sequenceNumbers.map(String)),
    keyOf: (_body, msg) => String(msg.sequenceNumber),
    transform: (body) => body,
  });

  res.json({ jobId: job.id, totalKeys: job.totalKeys });
});

router.post('/reprocess/csv', async (req, res) => {
  const { connId, entity, file, keyColumn, keyPath, rules } = req.body || {};
  let conn;
  let parsedRules;
  let table;
  try {
    conn = getConnection(connId);
    validateEntity(entity);
    if (!file || !file.name) throw new Error('Informe o arquivo CSV.');
    if (!keyColumn) throw new Error('Informe a coluna chave do CSV.');
    if (!keyPath) throw new Error('Informe o caminho da chave no body da mensagem (dot notation).');
    if (!Array.isArray(rules) || !rules.length) throw new Error('Informe ao menos uma regra de alteração.');
    parsedRules = rules.map((r) => {
      if (!r.path) throw new Error('Toda regra precisa de um caminho no body.');
      return { path: r.path, ...parseRuleSpec(r.spec) };
    });
    table = csv.parse(sharedFiles.readText(file.source, file.name));
    if (!table.headers.includes(keyColumn)) throw new Error(`Coluna chave "${keyColumn}" não existe no CSV.`);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const keyIdx = table.headers.indexOf(keyColumn);
  const rowsByKey = new Map();
  for (const row of table.rows) {
    const key = String(row[keyIdx] ?? '').trim();
    if (key) rowsByKey.set(key, row);
  }

  const job = startReprocessJob({
    conn,
    entity,
    keys: new Set(rowsByKey.keys()),
    keyOf: (body) => String(dot.get(body, keyPath) ?? '').trim(),
    transform: (body, key) => {
      const row = rowsByKey.get(key);
      const newBody = typeof body === 'object' && body !== null ? body : {};
      for (const rule of parsedRules) {
        const raw = rule.csvColumn ? row[rule.csvColumn - 1] : rule.raw;
        dot.set(newBody, rule.path, castValue(rule.type, raw));
      }
      return newBody;
    },
  });

  res.json({ jobId: job.id, totalKeys: job.totalKeys });
});

router.get('/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job não encontrado.' });
  res.json(job);
});

module.exports = {
  meta: {
    title: 'DLQ Explorer',
    description: 'Exporte e reprocesse dead letters do Azure Service Bus (fila ou tópico).',
    order: 6,
    icon: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"></path><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>`,
  },
  router,
  // funções puras expostas para os testes (o module-loader só lê meta e router)
  internals: { maskConnection, validateEntity, decodeBody, exportShape, buildResendMessage, parseRuleSpec, castValue },
};
