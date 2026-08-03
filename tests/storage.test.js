// Os testes gravam de verdade em data/config, usando nomes prefixados com
// "__test-" e removendo os arquivos no final.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const storage = require('../core/storage');
const { CONFIG_DIR } = require('../core/paths');

const NOME = '__test-storage';
const ARQUIVO = path.join(CONFIG_DIR, `${NOME}.json`);

function limpar() {
  for (const f of [ARQUIVO, `${ARQUIVO}.tmp`]) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
}

test('storage', async (t) => {
  t.after(limpar);
  limpar();

  await t.test('read devolve o fallback quando o arquivo não existe', () => {
    assert.deepEqual(storage.read(NOME, []), []);
    assert.deepEqual(storage.read(NOME, { a: 1 }), { a: 1 });
  });

  await t.test('write grava e read recupera', () => {
    storage.write(NOME, [{ id: 'x', nome: 'ana' }]);
    assert.deepEqual(storage.read(NOME), [{ id: 'x', nome: 'ana' }]);
  });

  await t.test('write sobrescreve o conteúdo anterior', () => {
    storage.write(NOME, [{ id: 'y' }]);
    assert.deepEqual(storage.read(NOME), [{ id: 'y' }]);
  });

  await t.test('não deixa arquivo .tmp para trás (escrita atômica)', () => {
    assert.equal(fs.existsSync(`${ARQUIVO}.tmp`), false);
  });

  await t.test('read devolve o fallback quando o JSON está corrompido', () => {
    fs.writeFileSync(ARQUIVO, '{ isso não é json', 'utf8');
    assert.deepEqual(storage.read(NOME, ['fallback']), ['fallback']);
  });

  await t.test('write rejeita nome com caracteres inválidos', () => {
    // impede escapar de data/config
    assert.throws(() => storage.write('../../etc/passwd', []), /Nome de storage inválido/);
    assert.throws(() => storage.write('a/b', []), /Nome de storage inválido/);
    assert.throws(() => storage.write('nome com espaco', []), /Nome de storage inválido/);
    assert.throws(() => storage.write('', []), /Nome de storage inválido/);
  });

  await t.test('read devolve o fallback para nome inválido em vez de lançar', () => {
    // o catch de read engole o erro de validação; nada é lido fora de data/config
    assert.deepEqual(storage.read('../../etc/passwd', ['fallback']), ['fallback']);
    assert.deepEqual(storage.read('a/b', []), []);
  });

  await t.test('aceita letras, números, hífen e underscore', () => {
    assert.doesNotThrow(() => storage.write('__test-abc_123', []));
    fs.unlinkSync(path.join(CONFIG_DIR, '__test-abc_123.json'));
  });
});

test('storage.newId', async (t) => {
  await t.test('gera ids únicos', () => {
    const ids = new Set(Array.from({ length: 500 }, () => storage.newId()));
    assert.equal(ids.size, 500);
  });

  await t.test('gera id sem caracteres problemáticos para URL', () => {
    assert.match(storage.newId(), /^[a-z0-9-]+$/);
  });
});
