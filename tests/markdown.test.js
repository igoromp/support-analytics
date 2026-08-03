const test = require('node:test');
const assert = require('node:assert/strict');
const { render } = require('../core/markdown');

test('markdown · blocos', async (t) => {
  await t.test('títulos de h1 a h4', () => {
    assert.equal(render('# Um'), '<h1>Um</h1>');
    assert.equal(render('#### Quatro'), '<h4>Quatro</h4>');
  });

  await t.test('mais de 4 "#" não vira título', () => {
    assert.match(render('##### Cinco'), /^<p>/);
  });

  await t.test('parágrafo junta linhas consecutivas', () => {
    assert.equal(render('linha um\nlinha dois'), '<p>linha um linha dois</p>');
  });

  await t.test('linha em branco separa parágrafos', () => {
    assert.equal(render('a\n\nb'), '<p>a</p>\n<p>b</p>');
  });

  await t.test('lista não ordenada', () => {
    assert.equal(render('- um\n- dois'), '<ul><li>um</li><li>dois</li></ul>');
  });

  await t.test('lista ordenada', () => {
    assert.equal(render('1. um\n2. dois'), '<ol><li>um</li><li>dois</li></ol>');
  });

  await t.test('item de lista absorve linha de continuação', () => {
    assert.equal(render('- começo\n  continuação'), '<ul><li>começo continuação</li></ul>');
  });

  await t.test('bloco de código preserva o conteúdo sem interpretar markdown', () => {
    assert.equal(render('```\n# não é título\n```'), '<pre><code># não é título</code></pre>');
  });

  await t.test('bloco de código com linguagem', () => {
    assert.equal(render('```js\nconst a = 1;\n```'), '<pre><code>const a = 1;</code></pre>');
  });

  await t.test('citação é renderizada recursivamente', () => {
    assert.equal(render('> importante'), '<blockquote><p>importante</p></blockquote>');
  });

  await t.test('linha horizontal', () => {
    assert.equal(render('---'), '<hr>');
    assert.equal(render('***'), '<hr>');
  });

  await t.test('tabela com cabeçalho e corpo', () => {
    const html = render('| a | b |\n| --- | --- |\n| 1 | 2 |');
    assert.match(html, /<table><thead><tr><th>a<\/th><th>b<\/th><\/tr><\/thead>/);
    assert.match(html, /<tbody><tr><td>1<\/td><td>2<\/td><\/tr><\/tbody><\/table>/);
  });

  await t.test('pipe sem linha separadora não vira tabela', () => {
    assert.match(render('a | b\ntexto'), /^<p>/);
  });

  await t.test('entrada vazia gera saída vazia', () => {
    assert.equal(render(''), '');
  });

  await t.test('aceita CRLF', () => {
    assert.equal(render('# Um\r\n\r\ntexto'), '<h1>Um</h1>\n<p>texto</p>');
  });
});

test('markdown · inline', async (t) => {
  await t.test('negrito, itálico e código', () => {
    assert.equal(render('**forte**'), '<p><strong>forte</strong></p>');
    assert.equal(render('*ênfase*'), '<p><em>ênfase</em></p>');
    assert.equal(render('`codigo`'), '<p><code>codigo</code></p>');
  });

  await t.test('link', () => {
    assert.equal(render('[texto](https://x.com)'), '<p><a href="https://x.com">texto</a></p>');
  });

  await t.test('escapa HTML do conteúdo', () => {
    assert.equal(render('<script>alert(1)</script>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });

  await t.test('escapa HTML dentro de bloco de código', () => {
    assert.equal(render('```\n<b>x</b>\n```'), '<pre><code>&lt;b&gt;x&lt;/b&gt;</code></pre>');
  });

  await t.test('escapa & e aspas', () => {
    assert.equal(render('a & "b"'), '<p>a &amp; &quot;b&quot;</p>');
  });

  await t.test('formatação inline funciona dentro de título e de item de lista', () => {
    assert.equal(render('# um **forte**'), '<h1>um <strong>forte</strong></h1>');
    assert.equal(render('- um `cod`'), '<ul><li>um <code>cod</code></li></ul>');
  });
});
