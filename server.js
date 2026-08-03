const express = require('express');
const path = require('path');
const { PUBLIC_DIR } = require('./core/paths');
const loader = require('./core/module-loader');
const { renderPage } = require('./core/render');
const sharedFiles = require('./core/shared-files');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '100mb' }));
app.use('/public', express.static(PUBLIC_DIR));

const modules = loader.discover();

app.get('/', (req, res) => {
  const cards = modules
    .map(
      (m) => `
      <a class="module-card" href="/${m.name}">
        <div class="module-card-icon">${m.icon}</div>
        <div class="module-card-body">
          <h3>${m.title}</h3>
          <p>${m.description}</p>
        </div>
        <code class="module-card-id">/${m.name}</code>
      </a>`
    )
    .join('\n');

  res.send(
    renderPage({
      title: 'Support Analytics',
      moduleTitle: 'Visão geral',
      moduleDescription: 'Ferramentas para rotinas de suporte: conversões, APIs em lote e DLQs.',
      content: `<div class="module-grid">${cards}</div>`,
      modules,
    })
  );
});

loader.mount(app, modules);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Erro interno' });
});

sharedFiles.cleanTmp();

app.listen(PORT, () => {
  console.log(`Support Analytics rodando em http://localhost:${PORT}`);
  console.log(`Módulos carregados: ${modules.map((m) => m.name).join(', ') || '(nenhum)'}`);
});
