// Descoberta e montagem dos módulos.
// Cada pasta em modules/ é um módulo e deve conter:
//   index.js   → exporta { meta: { title, description, icon, order }, router }
//   page.html  → fragmento HTML da interface (injetado no template padrão)
//   client.js  → (opcional) script da página
//   doc.md     → documentação, servida em /<modulo>/doc
//
// O loader monta automaticamente:
//   /api/<modulo>/*  → rotas do router do módulo
//   /<modulo>        → página do módulo dentro do shell
//   /<modulo>/doc    → documentação renderizada

const fs = require('fs');
const path = require('path');
const express = require('express');
const { MODULES_DIR } = require('./paths');
const { renderPage } = require('./render');
const markdown = require('./markdown');

function discover() {
  const modules = [];
  for (const entry of fs.readdirSync(MODULES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(MODULES_DIR, entry.name);
    const indexPath = path.join(dir, 'index.js');
    if (!fs.existsSync(indexPath)) continue;
    const mod = require(indexPath);
    modules.push({
      name: entry.name,
      dir,
      title: mod.meta?.title || entry.name,
      description: mod.meta?.description || '',
      icon: mod.meta?.icon || '',
      order: mod.meta?.order ?? 99,
      router: mod.router,
    });
  }
  modules.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  return modules;
}

function mount(app, modules) {
  for (const mod of modules) {
    if (mod.router) app.use(`/api/${mod.name}`, mod.router);

    const staticDir = path.join(mod.dir, 'static');
    if (fs.existsSync(staticDir)) app.use(`/modules/${mod.name}/static`, express.static(staticDir));

    const clientPath = path.join(mod.dir, 'client.js');
    if (fs.existsSync(clientPath)) {
      app.get(`/modules/${mod.name}/client.js`, (req, res) => res.sendFile(clientPath));
    }

    app.get(`/${mod.name}`, (req, res) => {
      const pagePath = path.join(mod.dir, 'page.html');
      const content = fs.existsSync(pagePath)
        ? fs.readFileSync(pagePath, 'utf8')
        : '<p>Este módulo não possui interface.</p>';
      const scripts = fs.existsSync(clientPath) ? [`/modules/${mod.name}/client.js`] : [];
      res.send(
        renderPage({
          title: mod.title,
          content,
          modules,
          activeModule: mod.name,
          moduleTitle: mod.title,
          moduleDescription: mod.description,
          scripts,
          showDocLink: fs.existsSync(path.join(mod.dir, 'doc.md')),
        })
      );
    });

    app.get(`/${mod.name}/doc`, (req, res) => {
      const docPath = path.join(mod.dir, 'doc.md');
      if (!fs.existsSync(docPath)) return res.status(404).send('Documentação não encontrada.');
      const html = markdown.render(fs.readFileSync(docPath, 'utf8'));
      res.send(
        renderPage({
          title: `${mod.title} — Documentação`,
          content: `<article class="doc-page">${html}</article>
            <p><a class="btn btn-secondary" href="/${mod.name}">&larr; Voltar para o módulo</a></p>`,
          modules,
          activeModule: mod.name,
          moduleTitle: `${mod.title} · Documentação`,
          moduleDescription: '',
        })
      );
    });
  }
}

module.exports = { discover, mount };
