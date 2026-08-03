// Renderização do template padrão (shell) da aplicação.
// O template é mantido aqui no projeto principal; cada módulo fornece apenas
// o fragmento HTML da sua página e, opcionalmente, um client.js.

const fs = require('fs');
const path = require('path');
const { ROOT } = require('./paths');

const layoutPath = path.join(ROOT, 'public', 'layout.html');

function loadLayout() {
  return fs.readFileSync(layoutPath, 'utf8');
}

/**
 * @param {Object} opts
 * @param {string} opts.title título da aba
 * @param {string} opts.content HTML do conteúdo principal
 * @param {Array}  opts.modules registry de módulos (para a navegação)
 * @param {string} [opts.activeModule] nome do módulo ativo na navegação
 * @param {string} [opts.moduleTitle] título mostrado no cabeçalho da página
 * @param {string} [opts.moduleDescription]
 * @param {string[]} [opts.scripts] URLs de scripts extras
 * @param {boolean} [opts.showDocLink] mostra link para a documentação do módulo
 */
function renderPage(opts) {
  const nav = opts.modules
    .map((m) => {
      const active = m.name === opts.activeModule ? ' active' : '';
      return `<a class="nav-item${active}" href="/${m.name}">
        <span class="nav-icon">${m.icon || ''}</span>
        <span class="nav-label">${m.title}</span>
      </a>`;
    })
    .join('\n');

  const scripts = (opts.scripts || []).map((src) => `<script src="${src}"></script>`).join('\n');

  const docLink =
    opts.showDocLink && opts.activeModule
      ? `<a class="doc-link" href="/${opts.activeModule}/doc" title="Documentação do módulo">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
           doc
         </a>`
      : '';

  return loadLayout()
    .replace(/{{TITLE}}/g, opts.title)
    .replace('{{NAV_ITEMS}}', nav)
    .replace('{{MODULE_TITLE}}', opts.moduleTitle || opts.title)
    .replace('{{MODULE_DESCRIPTION}}', opts.moduleDescription || '')
    .replace('{{MODULE_ID}}', opts.activeModule || '')
    .replace('{{DOC_LINK}}', docLink)
    .replace('{{CONTENT}}', opts.content)
    .replace('{{SCRIPTS}}', scripts);
}

module.exports = { renderPage };
