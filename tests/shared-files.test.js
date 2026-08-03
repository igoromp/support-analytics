// Os testes gravam de verdade em data/tmp, usando nomes prefixados com
// "__test-" e removendo os arquivos no final. A pasta shared do usuário não é
// tocada — apenas lida em list().

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharedFiles = require('../core/shared-files');
const { TMP_DIR } = require('../core/paths');

const PREFIXO = '__test-sf';

function limpar() {
  for (const f of fs.readdirSync(TMP_DIR)) {
    if (f.startsWith(PREFIXO)) fs.unlinkSync(path.join(TMP_DIR, f));
  }
}

test('shared-files · resolve (validação de nome)', async (t) => {
  await t.test('aceita nome simples', () => {
    assert.equal(sharedFiles.resolve('tmp', 'a.csv'), path.join(TMP_DIR, 'a.csv'));
  });

  await t.test('bloqueia path traversal', () => {
    assert.throws(() => sharedFiles.resolve('tmp', '../segredo.txt'), /Nome de arquivo inválido/);
    assert.throws(() => sharedFiles.resolve('tmp', '../../etc/passwd'), /Nome de arquivo inválido/);
  });

  await t.test('bloqueia caminho com separador', () => {
    assert.throws(() => sharedFiles.resolve('tmp', 'sub/a.csv'), /Nome de arquivo inválido/);
    assert.throws(() => sharedFiles.resolve('tmp', 'C:\\Windows\\system.ini'), /Nome de arquivo inválido/);
  });

  await t.test('bloqueia arquivo oculto', () => {
    assert.throws(() => sharedFiles.resolve('tmp', '.env'), /Nome de arquivo inválido/);
  });

  await t.test('bloqueia nome vazio', () => {
    assert.throws(() => sharedFiles.resolve('tmp', ''), /Nome de arquivo inválido/);
  });

  await t.test('rejeita origem desconhecida', () => {
    assert.throws(() => sharedFiles.resolve('outra', 'a.csv'), /Origem de arquivo inválida/);
  });

  await t.test('aceita as duas origens válidas', () => {
    assert.doesNotThrow(() => sharedFiles.resolve('shared', 'a.csv'));
    assert.doesNotThrow(() => sharedFiles.resolve('tmp', 'a.csv'));
  });
});

test('shared-files · leitura e escrita', async (t) => {
  t.after(limpar);
  limpar();

  await t.test('writeText grava e readText recupera', () => {
    const nome = sharedFiles.writeText('tmp', `${PREFIXO}-a.txt`, 'conteúdo');
    assert.equal(nome, `${PREFIXO}-a.txt`);
    assert.equal(sharedFiles.readText('tmp', nome), 'conteúdo');
  });

  await t.test('writeText acrescenta sufixo em vez de sobrescrever', () => {
    const nome = sharedFiles.writeText('tmp', `${PREFIXO}-a.txt`, 'outro');
    assert.equal(nome, `${PREFIXO}-a(1).txt`);
    // o original continua intacto
    assert.equal(sharedFiles.readText('tmp', `${PREFIXO}-a.txt`), 'conteúdo');
  });

  await t.test('o sufixo avança enquanto houver conflito', () => {
    assert.equal(sharedFiles.writeText('tmp', `${PREFIXO}-a.txt`, 'terceiro'), `${PREFIXO}-a(2).txt`);
  });

  await t.test('exists reflete a existência', () => {
    assert.equal(sharedFiles.exists('tmp', `${PREFIXO}-a.txt`), true);
    assert.equal(sharedFiles.exists('tmp', `${PREFIXO}-nao-existe.txt`), false);
  });

  await t.test('exists devolve false para nome inválido em vez de lançar', () => {
    assert.equal(sharedFiles.exists('tmp', '../x'), false);
  });

  await t.test('list traz os arquivos criados com metadados', () => {
    const itens = sharedFiles.list('tmp').filter((f) => f.name.startsWith(PREFIXO));
    assert.equal(itens.length, 3);
    const a = itens.find((f) => f.name === `${PREFIXO}-a.txt`);
    assert.equal(a.ext, 'txt');
    assert.ok(a.size > 0);
    assert.ok(!Number.isNaN(Date.parse(a.modifiedAt)));
  });

  await t.test('list não inclui arquivos ocultos', () => {
    assert.equal(sharedFiles.list('tmp').some((f) => f.name.startsWith('.')), false);
  });

  await t.test('remove apaga o arquivo', () => {
    sharedFiles.remove('tmp', `${PREFIXO}-a(2).txt`);
    assert.equal(sharedFiles.exists('tmp', `${PREFIXO}-a(2).txt`), false);
  });

  await t.test('readText de arquivo inexistente lança', () => {
    assert.throws(() => sharedFiles.readText('tmp', `${PREFIXO}-fantasma.txt`));
  });
});
