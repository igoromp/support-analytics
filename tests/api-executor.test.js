const test = require('node:test');
const assert = require('node:assert/strict');
const { internals } = require('../modules/api-executor');

const { validateApi, fillTemplate, extractSaved, resolveOverrideValue } = internals;

test('validateApi', async (t) => {
  const valida = { name: 'consulta', method: 'GET', url: 'https://api.exemplo.com' };

  await t.test('aceita cadastro completo', () => {
    assert.equal(validateApi(valida), null);
  });

  await t.test('exige nome não vazio', () => {
    assert.match(validateApi({ ...valida, name: '' }), /Informe um nome/);
    assert.match(validateApi({ ...valida, name: '   ' }), /Informe um nome/);
  });

  await t.test('aceita os verbos suportados', () => {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      assert.equal(validateApi({ ...valida, method }), null, `verbo ${method}`);
    }
  });

  await t.test('rejeita verbo inválido ou minúsculo', () => {
    assert.match(validateApi({ ...valida, method: 'HEAD' }), /Verbo HTTP inválido/);
    assert.match(validateApi({ ...valida, method: 'get' }), /Verbo HTTP inválido/);
  });

  await t.test('exige URL http(s)', () => {
    assert.match(validateApi({ ...valida, url: 'ftp://x' }), /http:\/\/ ou https:\/\//);
    assert.match(validateApi({ ...valida, url: 'exemplo.com' }), /http:\/\/ ou https:\/\//);
    assert.equal(validateApi({ ...valida, url: 'HTTPS://X' }), null);
  });

  await t.test('não quebra com body ausente', () => {
    assert.match(validateApi(undefined), /Informe um nome/);
  });
});

test('fillTemplate', async (t) => {
  await t.test('substitui placeholder simples', () => {
    assert.equal(fillTemplate('id={{id}}', { id: 42 }), 'id=42');
  });

  await t.test('aceita espaços dentro das chaves', () => {
    assert.equal(fillTemplate('{{ id }}', { id: 1 }), '1');
  });

  await t.test('resolve dot notation', () => {
    assert.equal(fillTemplate('{{pedido.id}}', { pedido: { id: 'P1' } }), 'P1');
  });

  await t.test('troca campo ausente ou nulo por vazio', () => {
    assert.equal(fillTemplate('[{{nao.existe}}]', { a: 1 }), '[]');
    assert.equal(fillTemplate('[{{a}}]', { a: null }), '[]');
  });

  await t.test('sem registro, todos os placeholders ficam vazios', () => {
    assert.equal(fillTemplate('[{{a}}]', null), '[]');
  });

  await t.test('serializa objeto como JSON', () => {
    assert.equal(fillTemplate('{{obj}}', { obj: { a: 1 } }), '{"a":1}');
  });

  await t.test('forUrl codifica o valor para querystring', () => {
    assert.equal(fillTemplate('{{v}}', { v: 'a b&c' }, { forUrl: true }), 'a%20b%26c');
  });

  await t.test('jsonContext escapa aspas para não quebrar o JSON do body', () => {
    const out = fillTemplate('{"nome":"{{n}}"}', { n: 'diz "oi"' }, { jsonContext: true });
    assert.equal(out, '{"nome":"diz \\"oi\\""}');
    assert.deepEqual(JSON.parse(out), { nome: 'diz "oi"' });
  });

  await t.test('jsonContext escapa quebra de linha', () => {
    const out = fillTemplate('{"obs":"{{o}}"}', { o: 'l1\nl2' }, { jsonContext: true });
    assert.deepEqual(JSON.parse(out), { obs: 'l1\nl2' });
  });

  await t.test('jsonContext insere objeto como JSON, sem escapar', () => {
    const out = fillTemplate('{"dados":{{d}}}', { d: { a: 1 } }, { jsonContext: true });
    assert.deepEqual(JSON.parse(out), { dados: { a: 1 } });
  });

  await t.test('substitui múltiplas ocorrências', () => {
    assert.equal(fillTemplate('{{a}}-{{a}}-{{b}}', { a: 1, b: 2 }), '1-1-2');
  });

  await t.test('texto sem placeholder passa intacto', () => {
    assert.equal(fillTemplate('sem nada', { a: 1 }), 'sem nada');
  });
});

test('resolveOverrideValue', async (t) => {
  const registro = {
    taxa: 12.5,
    ativo: true,
    endereco: { cidade: 'SP', cep: '01000-000' },
    id: 'P1',
  };

  await t.test('placeholder único preserva número', () => {
    assert.equal(resolveOverrideValue('{{taxa}}', registro), 12.5);
    assert.equal(typeof resolveOverrideValue('{{taxa}}', registro), 'number');
  });

  await t.test('placeholder único preserva boolean', () => {
    assert.equal(resolveOverrideValue('{{ativo}}', registro), true);
    assert.equal(typeof resolveOverrideValue('{{ativo}}', registro), 'boolean');
  });

  await t.test('placeholder único preserva objeto', () => {
    assert.deepEqual(resolveOverrideValue('{{endereco}}', registro), { cidade: 'SP', cep: '01000-000' });
  });

  await t.test('placeholder único com espaços também preserva o tipo', () => {
    assert.equal(resolveOverrideValue('{{  taxa  }}', registro), 12.5);
    assert.equal(typeof resolveOverrideValue('{{ ativo }}', registro), 'boolean');
  });

  await t.test('valor fixo sem placeholder vira a string literal', () => {
    assert.equal(resolveOverrideValue('ajuste manual', registro), 'ajuste manual');
  });

  await t.test('valor misto retorna string concatenada', () => {
    assert.equal(resolveOverrideValue('pedido-{{id}}', registro), 'pedido-P1');
    assert.equal(resolveOverrideValue('{{id}}/{{taxa}}', registro), 'P1/12.5');
  });

  await t.test('placeholder único para caminho inexistente retorna undefined', () => {
    assert.equal(resolveOverrideValue('{{nao.existe}}', registro), undefined);
  });
});

test('extractSaved', async (t) => {
  const resposta = { status: 'ok', dados: { id: 'P1', valor: 10 } };

  await t.test('modo diferente de "fields" devolve a resposta inteira', () => {
    assert.deepEqual(extractSaved(resposta, { mode: 'full' }), resposta);
  });

  await t.test('modo "fields" extrai os caminhos pedidos', () => {
    const out = extractSaved(resposta, { mode: 'fields', fields: [{ path: 'dados.id' }, { path: 'status' }] });
    assert.deepEqual(out, { 'dados.id': 'P1', status: 'ok' });
  });

  await t.test('aplica o rename quando informado', () => {
    const out = extractSaved(resposta, { mode: 'fields', fields: [{ path: 'dados.id', rename: 'pedido' }] });
    assert.deepEqual(out, { pedido: 'P1' });
  });

  await t.test('ignora entradas sem path', () => {
    const out = extractSaved(resposta, { mode: 'fields', fields: [{ path: '' }, { path: 'status' }] });
    assert.deepEqual(out, { status: 'ok' });
  });

  await t.test('caminho inexistente vira undefined', () => {
    const out = extractSaved(resposta, { mode: 'fields', fields: [{ path: 'nao.existe' }] });
    assert.deepEqual(out, { 'nao.existe': undefined });
  });

  await t.test('sem lista de fields devolve objeto vazio', () => {
    assert.deepEqual(extractSaved(resposta, { mode: 'fields' }), {});
  });
});
