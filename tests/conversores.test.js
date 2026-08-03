// Helpers puros dos módulos de conversão CSV ⇄ JSON.

const test = require('node:test');
const assert = require('node:assert/strict');

const { castFixed } = require('../modules/csv-to-json').internals;
const { resolveItems, suggestArrayPaths } = require('../modules/json-to-csv').internals;

test('csv-to-json · castFixed', async (t) => {
  await t.test('converte número', () => {
    assert.equal(castFixed('number', '10'), 10);
    assert.equal(castFixed('number', '-1.5'), -1.5);
  });

  await t.test('rejeita número inválido', () => {
    assert.throws(() => castFixed('number', 'abc'), /não é um número válido/);
  });

  await t.test('boolean aceita apenas "true" (com qualquer caixa)', () => {
    assert.equal(castFixed('boolean', 'true'), true);
    assert.equal(castFixed('boolean', 'TRUE'), true);
    assert.equal(castFixed('boolean', '1'), false);
    assert.equal(castFixed('boolean', 'sim'), false);
  });

  await t.test('tipo desconhecido cai em string', () => {
    assert.equal(castFixed('qualquer', 10), '10');
    assert.equal(castFixed('string', 10), '10');
  });
});

test('json-to-csv · resolveItems', async (t) => {
  await t.test('devolve a raiz quando já é array', () => {
    const data = [{ a: 1 }];
    assert.equal(resolveItems(data), data);
  });

  await t.test('resolve array por dot notation', () => {
    const data = { resultado: { itens: [{ a: 1 }] } };
    assert.deepEqual(resolveItems(data, 'resultado.itens'), [{ a: 1 }]);
  });

  await t.test('erro quando a raiz não é array e não há caminho', () => {
    assert.throws(() => resolveItems({ a: 1 }), /não é um array/);
  });

  await t.test('erro quando o caminho não aponta para array', () => {
    assert.throws(() => resolveItems({ a: { b: 1 } }, 'a.b'), /não aponta para um array/);
  });

  await t.test('erro quando o caminho não existe', () => {
    assert.throws(() => resolveItems({ a: 1 }, 'x.y'), /não aponta para um array/);
  });
});

test('json-to-csv · suggestArrayPaths', async (t) => {
  await t.test('encontra array aninhado', () => {
    assert.deepEqual(suggestArrayPaths({ resultado: { itens: [1, 2] } }), ['resultado.itens']);
  });

  await t.test('encontra vários arrays', () => {
    const out = suggestArrayPaths({ a: { x: [] }, b: [] });
    assert.deepEqual(out.sort(), ['a.x', 'b']);
  });

  await t.test('array na raiz não gera sugestão (prefixo vazio)', () => {
    assert.deepEqual(suggestArrayPaths([1, 2]), []);
  });

  await t.test('objeto sem arrays não gera sugestões', () => {
    assert.deepEqual(suggestArrayPaths({ a: 1, b: { c: 2 } }), []);
  });

  await t.test('para de descer após 4 níveis', () => {
    const fundo = { n1: { n2: { n3: { n4: { n5: { alvo: [] } } } } } };
    assert.deepEqual(suggestArrayPaths(fundo), []);
  });

  await t.test('não quebra com null', () => {
    assert.deepEqual(suggestArrayPaths({ a: null }), []);
  });
});
