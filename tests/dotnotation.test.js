const test = require('node:test');
const assert = require('node:assert/strict');
const dot = require('../core/dotnotation');

test('get', async (t) => {
  await t.test('lê caminho aninhado', () => {
    assert.equal(dot.get({ a: { b: { c: 7 } } }, 'a.b.c'), 7);
  });

  await t.test('retorna undefined para caminho inexistente', () => {
    assert.equal(dot.get({ a: 1 }, 'a.b.c'), undefined);
    assert.equal(dot.get({}, 'x'), undefined);
  });

  await t.test('retorna undefined para obj nulo', () => {
    assert.equal(dot.get(null, 'a'), undefined);
    assert.equal(dot.get(undefined, 'a'), undefined);
  });

  await t.test('indexa arrays por número', () => {
    assert.equal(dot.get({ itens: [{ id: 'x' }, { id: 'y' }] }, 'itens.1.id'), 'y');
  });

  await t.test('chave plana com ponto no nome tem prioridade sobre o caminho', () => {
    // caso real: coluna de CSV chamada "merchant.name"
    const obj = { 'merchant.name': 'plano', merchant: { name: 'aninhado' } };
    assert.equal(dot.get(obj, 'merchant.name'), 'plano');
  });

  await t.test('cai no caminho aninhado quando não há chave plana', () => {
    assert.equal(dot.get({ merchant: { name: 'aninhado' } }, 'merchant.name'), 'aninhado');
  });

  await t.test('para de descer ao encontrar valor primitivo no meio', () => {
    assert.equal(dot.get({ a: 'texto' }, 'a.b'), undefined);
  });

  await t.test('preserva valores falsy', () => {
    assert.equal(dot.get({ a: { b: 0 } }, 'a.b'), 0);
    assert.equal(dot.get({ a: { b: '' } }, 'a.b'), '');
    assert.equal(dot.get({ a: { b: false } }, 'a.b'), false);
  });
});

test('set', async (t) => {
  await t.test('grava em caminho existente', () => {
    const obj = { a: { b: 1 } };
    dot.set(obj, 'a.b', 2);
    assert.equal(obj.a.b, 2);
  });

  await t.test('cria objetos intermediários que faltam', () => {
    const obj = {};
    dot.set(obj, 'a.b.c', 'x');
    assert.deepEqual(obj, { a: { b: { c: 'x' } } });
  });

  await t.test('cria array quando o próximo segmento é numérico', () => {
    const obj = {};
    dot.set(obj, 'lista.0.id', 'x');
    assert.ok(Array.isArray(obj.lista));
    assert.equal(obj.lista[0].id, 'x');
  });

  await t.test('sobrescreve primitivo no meio do caminho', () => {
    const obj = { a: 'texto' };
    dot.set(obj, 'a.b', 1);
    assert.deepEqual(obj, { a: { b: 1 } });
  });

  await t.test('retorna o próprio objeto', () => {
    const obj = {};
    assert.equal(dot.set(obj, 'x', 1), obj);
  });

  await t.test('grava chave simples sem ponto', () => {
    const obj = {};
    dot.set(obj, 'x', 1);
    assert.deepEqual(obj, { x: 1 });
  });
});

test('flatten', async (t) => {
  await t.test('achata objeto aninhado', () => {
    assert.deepEqual(dot.flatten({ a: { b: 1 }, c: 2 }), { 'a.b': 1, c: 2 });
  });

  await t.test('expande índices de array', () => {
    assert.deepEqual(dot.flatten({ l: ['x', 'y'] }), { 'l.0': 'x', 'l.1': 'y' });
  });

  await t.test('mantém array vazio como valor', () => {
    assert.deepEqual(dot.flatten({ l: [] }), { l: [] });
  });

  await t.test('mantém objeto vazio como valor', () => {
    assert.deepEqual(dot.flatten({ o: {} }), { o: {} });
  });

  await t.test('preserva null', () => {
    assert.deepEqual(dot.flatten({ a: null }), { a: null });
  });
});

test('unflatten', async (t) => {
  await t.test('reconstrói o objeto aninhado', () => {
    assert.deepEqual(dot.unflatten({ 'a.b': 1, c: 2 }), { a: { b: 1 }, c: 2 });
  });

  await t.test('flatten → unflatten preserva a estrutura', () => {
    const original = { pedido: { id: 'P1', itens: ['a', 'b'] }, total: 10 };
    assert.deepEqual(dot.unflatten(dot.flatten(original)), original);
  });
});

test('collectPaths', async (t) => {
  await t.test('coleta os caminhos folha', () => {
    const paths = [...dot.collectPaths({ a: { b: 1 }, c: 2 })];
    assert.deepEqual(paths.sort(), ['a.b', 'c']);
  });

  await t.test('usa apenas o primeiro item do array, sem índice', () => {
    // mantém a lista de campos enxuta para a UI
    const paths = [...dot.collectPaths({ itens: [{ id: 1 }, { id: 2 }] })];
    assert.deepEqual(paths, ['itens.id']);
  });

  await t.test('inclui array vazio como caminho', () => {
    assert.deepEqual([...dot.collectPaths({ l: [] })], ['l']);
  });

  await t.test('não estoura em estrutura muito profunda', () => {
    let deep = { fim: 1 };
    for (let i = 0; i < 40; i++) deep = { nivel: deep };
    assert.ok([...dot.collectPaths(deep)].length > 0);
  });
});
