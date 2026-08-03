// Garante que todo módulo em modules/ respeita o contrato esperado pelo
// autodescobridor — um módulo malformado só apareceria como erro em runtime.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { discover } = require('../core/module-loader');
const { MODULES_DIR } = require('../core/paths');

const modulos = discover();

test('module-loader · discover', async (t) => {
  await t.test('encontra todos os diretórios com index.js', () => {
    const esperados = fs
      .readdirSync(MODULES_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(MODULES_DIR, e.name, 'index.js')))
      .map((e) => e.name);
    assert.deepEqual(modulos.map((m) => m.name).sort(), esperados.sort());
  });

  await t.test('encontra pelo menos um módulo', () => {
    assert.ok(modulos.length > 0);
  });

  await t.test('ordena por order e desempata por título', () => {
    for (let i = 1; i < modulos.length; i++) {
      const anterior = modulos[i - 1];
      const atual = modulos[i];
      assert.ok(
        anterior.order < atual.order || (anterior.order === atual.order && anterior.title.localeCompare(atual.title) <= 0),
        `${anterior.name} (${anterior.order}) deveria vir antes de ${atual.name} (${atual.order})`
      );
    }
  });

  await t.test('ordens não se repetem — a barra lateral fica estável', () => {
    const ordens = modulos.map((m) => m.order);
    assert.equal(new Set(ordens).size, ordens.length);
  });
});

test('module-loader · contrato dos módulos', async (t) => {
  for (const mod of modulos) {
    await t.test(`${mod.name} cumpre o contrato`, () => {
      assert.ok(mod.title && mod.title !== mod.name, 'precisa de meta.title');
      assert.ok(mod.description, 'precisa de meta.description');
      assert.equal(typeof mod.order, 'number', 'precisa de meta.order numérico');
      assert.match(mod.icon, /^<svg/, 'precisa de meta.icon em SVG');
      assert.equal(typeof mod.router, 'function', 'precisa exportar um router');
    });

    await t.test(`${mod.name} tem os arquivos de front e a doc`, () => {
      for (const arquivo of ['page.html', 'client.js', 'doc.md']) {
        assert.ok(fs.existsSync(path.join(mod.dir, arquivo)), `falta ${arquivo}`);
      }
    });
  }
});
