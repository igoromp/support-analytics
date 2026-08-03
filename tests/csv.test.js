const test = require('node:test');
const assert = require('node:assert/strict');
const csv = require('../core/csv');

test('detectDelimiter', async (t) => {
  await t.test('usa vírgula por padrão', () => {
    assert.equal(csv.detectDelimiter('a,b,c\n1,2,3'), ',');
  });

  await t.test('detecta ponto e vírgula (padrão pt-BR)', () => {
    assert.equal(csv.detectDelimiter('nome;valor;data\nx;1;hoje'), ';');
  });

  await t.test('detecta tabulação', () => {
    assert.equal(csv.detectDelimiter('a\tb\tc\n1\t2\t3'), '\t');
  });

  await t.test('ignora delimitadores dentro de aspas', () => {
    // a vírgula real é uma só; as outras estão dentro do campo entre aspas
    assert.equal(csv.detectDelimiter('"a;b;c;d";x'), ';');
  });

  await t.test('considera apenas a primeira linha', () => {
    assert.equal(csv.detectDelimiter('a,b\n1;2;3;4;5'), ',');
  });
});

test('parse', async (t) => {
  await t.test('separa cabeçalho das linhas', () => {
    const r = csv.parse('id,nome\n1,ana\n2,bruno');
    assert.deepEqual(r.headers, ['id', 'nome']);
    assert.deepEqual(r.rows, [['1', 'ana'], ['2', 'bruno']]);
    assert.equal(r.delimiter, ',');
  });

  await t.test('remove BOM UTF-8 do primeiro cabeçalho', () => {
    const r = csv.parse('﻿id,nome\n1,ana');
    assert.deepEqual(r.headers, ['id', 'nome']);
  });

  await t.test('aceita CRLF', () => {
    const r = csv.parse('id,nome\r\n1,ana\r\n2,bruno');
    assert.deepEqual(r.rows, [['1', 'ana'], ['2', 'bruno']]);
  });

  await t.test('respeita delimitador dentro de campo entre aspas', () => {
    const r = csv.parse('id,descricao\n1,"pagamento, parcelado"');
    assert.deepEqual(r.rows, [['1', 'pagamento, parcelado']]);
  });

  await t.test('desescapa aspas duplicadas', () => {
    const r = csv.parse('id,texto\n1,"ele disse ""oi"""');
    assert.deepEqual(r.rows, [['1', 'ele disse "oi"']]);
  });

  await t.test('aceita quebra de linha dentro de campo entre aspas', () => {
    const r = csv.parse('id,obs\n1,"linha1\nlinha2"');
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0][1], 'linha1\nlinha2');
  });

  await t.test('descarta linhas vazias no final', () => {
    const r = csv.parse('id,nome\n1,ana\n\n');
    assert.deepEqual(r.rows, [['1', 'ana']]);
  });

  await t.test('nomeia colunas de cabeçalho vazio', () => {
    const r = csv.parse('id,,nome\n1,x,ana');
    assert.deepEqual(r.headers, ['id', 'coluna_2', 'nome']);
  });

  await t.test('remove espaços em volta dos nomes de coluna', () => {
    const r = csv.parse(' id , nome \n1,ana');
    assert.deepEqual(r.headers, ['id', 'nome']);
  });

  await t.test('com hasHeader:false gera nomes posicionais e mantém todas as linhas', () => {
    const r = csv.parse('1,ana\n2,bruno', { hasHeader: false });
    assert.deepEqual(r.headers, ['coluna_1', 'coluna_2']);
    assert.equal(r.rows.length, 2);
  });

  await t.test('delimitador explícito vence a detecção', () => {
    const r = csv.parse('a;b\n1;2', { delimiter: ',' });
    assert.deepEqual(r.headers, ['a;b']);
  });

  await t.test('texto vazio não quebra', () => {
    const r = csv.parse('');
    assert.deepEqual(r.headers, []);
    assert.deepEqual(r.rows, []);
  });

  await t.test('preserva campos vazios no meio da linha', () => {
    const r = csv.parse('a,b,c\n1,,3');
    assert.deepEqual(r.rows, [['1', '', '3']]);
  });
});

test('serialize', async (t) => {
  await t.test('escreve cabeçalho e linhas posicionais com CRLF', () => {
    const out = csv.serialize(['id', 'nome'], [['1', 'ana']]);
    assert.equal(out, 'id,nome\r\n1,ana');
  });

  await t.test('aceita linhas como objetos indexados pelos headers', () => {
    const out = csv.serialize(['id', 'nome'], [{ id: '1', nome: 'ana' }]);
    assert.equal(out, 'id,nome\r\n1,ana');
  });

  await t.test('coloca entre aspas campos com delimitador, aspas ou quebra de linha', () => {
    const out = csv.serialize(['a'], [['x,y']], {});
    assert.equal(out, 'a\r\n"x,y"');
    assert.equal(csv.serialize(['a'], [['diz "oi"']]), 'a\r\n"diz ""oi"""');
    assert.equal(csv.serialize(['a'], [['l1\nl2']]), 'a\r\n"l1\nl2"');
  });

  await t.test('converte null e undefined em campo vazio', () => {
    assert.equal(csv.serialize(['a', 'b'], [[null, undefined]]), 'a,b\r\n,');
  });

  await t.test('respeita delimitador customizado ao escapar', () => {
    const out = csv.serialize(['a'], [['x;y']], { delimiter: ';' });
    assert.equal(out, 'a\r\n"x;y"');
  });

  await t.test('ida e volta preserva os dados', () => {
    const headers = ['id', 'obs'];
    const rows = [['1', 'tem , vírgula'], ['2', 'tem "aspas"'], ['3', 'tem\nquebra']];
    const parsed = csv.parse(csv.serialize(headers, rows));
    assert.deepEqual(parsed.headers, headers);
    assert.deepEqual(parsed.rows, rows);
  });
});

test('toObjects', async (t) => {
  await t.test('indexa os valores pelos headers', () => {
    const objs = csv.toObjects(['id', 'nome'], [['1', 'ana']]);
    assert.deepEqual(objs, [{ id: '1', nome: 'ana' }]);
  });

  await t.test('completa com string vazia quando faltam colunas na linha', () => {
    const objs = csv.toObjects(['id', 'nome', 'uf'], [['1']]);
    assert.deepEqual(objs, [{ id: '1', nome: '', uf: '' }]);
  });
});
