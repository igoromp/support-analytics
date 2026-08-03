const test = require('node:test');
const assert = require('node:assert/strict');
const { internals } = require('../modules/dlq-explorer');

const { maskConnection, validateEntity, decodeBody, exportShape, buildResendMessage, parseRuleSpec, castValue } = internals;

test('maskConnection', async (t) => {
  await t.test('expõe só id, nome e endpoint — nunca a connection string', () => {
    const masked = maskConnection({
      id: 'c1',
      name: 'produção',
      connectionString: 'Endpoint=sb://meu-ns.servicebus.windows.net/;SharedAccessKeyName=x;SharedAccessKey=SEGREDO',
    });
    assert.deepEqual(masked, { id: 'c1', name: 'produção', endpoint: 'meu-ns.servicebus.windows.net' });
    assert.equal(JSON.stringify(masked).includes('SEGREDO'), false);
  });

  await t.test('extrai o host do emulador local', () => {
    const masked = maskConnection({
      id: 'c2',
      name: 'local',
      connectionString: 'Endpoint=sb://localhost;SharedAccessKeyName=x;SharedAccessKey=y;UseDevelopmentEmulator=true;',
    });
    assert.equal(masked.endpoint, 'localhost');
  });

  await t.test('usa "?" quando o endpoint não casa com o padrão', () => {
    assert.equal(maskConnection({ id: 'c3', name: 'x', connectionString: 'lixo' }).endpoint, '?');
  });
});

test('validateEntity', async (t) => {
  await t.test('aceita fila com nome', () => {
    assert.doesNotThrow(() => validateEntity({ type: 'queue', queue: 'fila-teste' }));
  });

  await t.test('aceita tópico com subscription', () => {
    assert.doesNotThrow(() => validateEntity({ type: 'topic', topic: 't', subscription: 's' }));
  });

  await t.test('rejeita entidade ausente', () => {
    assert.throws(() => validateEntity(null), /Informe a fila ou tópico/);
  });

  await t.test('rejeita fila sem nome', () => {
    assert.throws(() => validateEntity({ type: 'queue' }), /Informe o nome da fila/);
  });

  await t.test('rejeita tópico sem subscription', () => {
    assert.throws(() => validateEntity({ type: 'topic', topic: 't' }), /tópico e a subscription/);
  });

  await t.test('rejeita tipo desconhecido', () => {
    assert.throws(() => validateEntity({ type: 'fila' }), /Tipo de entidade inválido/);
  });
});

test('decodeBody', async (t) => {
  await t.test('desserializa Buffer com JSON', () => {
    const r = decodeBody(Buffer.from('{"a":1}', 'utf8'));
    assert.deepEqual(r, { value: { a: 1 }, isJson: true });
  });

  await t.test('mantém Buffer de texto puro como string', () => {
    const r = decodeBody(Buffer.from('texto solto', 'utf8'));
    assert.deepEqual(r, { value: 'texto solto', isJson: false });
  });

  await t.test('desserializa string com JSON', () => {
    assert.deepEqual(decodeBody('{"a":1}'), { value: { a: 1 }, isJson: true });
  });

  await t.test('mantém string não-JSON', () => {
    assert.deepEqual(decodeBody('não é json'), { value: 'não é json', isJson: false });
  });

  await t.test('objeto já desserializado passa direto', () => {
    const obj = { a: 1 };
    assert.deepEqual(decodeBody(obj), { value: obj, isJson: true });
  });

  await t.test('null não é tratado como JSON', () => {
    assert.deepEqual(decodeBody(null), { value: null, isJson: false });
  });
});

test('exportShape', async (t) => {
  await t.test('converte sequenceNumber (Long) em string', () => {
    // o SDK entrega um Long, não um number — precisa sobreviver ao JSON
    const shaped = exportShape({ sequenceNumber: { toString: () => '42' }, body: '{}' });
    assert.equal(shaped.sequenceNumber, '42');
  });

  await t.test('omite sequenceNumber ausente', () => {
    assert.equal(exportShape({ body: '{}' }).sequenceNumber, undefined);
  });

  await t.test('preserva os metadados de dead letter e o body decodificado', () => {
    const shaped = exportShape({
      messageId: 'm1',
      deadLetterReason: 'ValidationError',
      deadLetterErrorDescription: 'campo inválido',
      deliveryCount: 3,
      applicationProperties: { origem: 'x' },
      body: Buffer.from('{"pedido":{"id":"P1"}}', 'utf8'),
    });
    assert.equal(shaped.messageId, 'm1');
    assert.equal(shaped.deadLetterReason, 'ValidationError');
    assert.equal(shaped.deadLetterErrorDescription, 'campo inválido');
    assert.equal(shaped.deliveryCount, 3);
    assert.deepEqual(shaped.applicationProperties, { origem: 'x' });
    assert.deepEqual(shaped.body, { pedido: { id: 'P1' } });
  });
});

test('buildResendMessage', async (t) => {
  const original = {
    messageId: 'm1',
    correlationId: 'c1',
    subject: 'liquidacao',
    sessionId: 's1',
    contentType: 'application/json',
    applicationProperties: { origem: 'x' },
  };

  await t.test('serializa body objeto e preserva as propriedades da original', () => {
    const msg = buildResendMessage(original, { a: 1 });
    assert.equal(msg.body, '{"a":1}');
    assert.equal(msg.messageId, 'm1');
    assert.equal(msg.correlationId, 'c1');
    assert.equal(msg.subject, 'liquidacao');
    assert.equal(msg.sessionId, 's1');
    assert.deepEqual(msg.applicationProperties, { origem: 'x' });
  });

  await t.test('body não-objeto vira string', () => {
    assert.equal(buildResendMessage(original, 'texto').body, 'texto');
    assert.equal(buildResendMessage(original, 42).body, '42');
  });

  await t.test('assume application/json quando a original não tem contentType', () => {
    assert.equal(buildResendMessage({}, {}).contentType, 'application/json');
  });
});

test('parseRuleSpec', async (t) => {
  await t.test('separa tipo e valor literal', () => {
    assert.deepEqual(parseRuleSpec('number:10'), { type: 'number', raw: '10', csvColumn: null });
    assert.deepEqual(parseRuleSpec('string:XPTO'), { type: 'string', raw: 'XPTO', csvColumn: null });
    assert.deepEqual(parseRuleSpec('boolean:true'), { type: 'boolean', raw: 'true', csvColumn: null });
  });

  await t.test('reconhece referência a coluna do CSV', () => {
    assert.deepEqual(parseRuleSpec('number:csv_2'), { type: 'number', raw: 'csv_2', csvColumn: 2 });
  });

  await t.test('divide no primeiro ":" — valores podem conter ":"', () => {
    const r = parseRuleSpec('string:https://exemplo.com');
    assert.equal(r.type, 'string');
    assert.equal(r.raw, 'https://exemplo.com');
  });

  await t.test('ignora espaços em volta', () => {
    assert.deepEqual(parseRuleSpec(' number : 10 '), { type: 'number', raw: '10', csvColumn: null });
  });

  await t.test('rejeita spec sem ":"', () => {
    assert.throws(() => parseRuleSpec('number10'), /Regra inválida/);
  });

  await t.test('rejeita tipo desconhecido', () => {
    assert.throws(() => parseRuleSpec('inteiro:10'), /Tipo inválido/);
  });
});

test('castValue', async (t) => {
  await t.test('converte número', () => {
    assert.equal(castValue('number', '10'), 10);
    assert.equal(castValue('number', '10.5'), 10.5);
  });

  await t.test('rejeita número inválido', () => {
    assert.throws(() => castValue('number', 'abc'), /não é um número válido/);
  });

  await t.test('converte boolean pelos valores aceitos', () => {
    assert.equal(castValue('boolean', 'true'), true);
    assert.equal(castValue('boolean', 'TRUE'), true);
    assert.equal(castValue('boolean', '1'), true);
    assert.equal(castValue('boolean', 'sim'), true);
    assert.equal(castValue('boolean', 'false'), false);
    assert.equal(castValue('boolean', 'qualquer'), false);
  });

  await t.test('converte string', () => {
    assert.equal(castValue('string', 10), '10');
  });
});
