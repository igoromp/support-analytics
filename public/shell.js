// Helpers globais do shell, disponíveis para todos os módulos como window.UI.

window.UI = (() => {
  /** fetch com tratamento de erro padronizado; retorna JSON. */
  async function api(path, options = {}) {
    const opts = { ...options };
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
      opts.headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
      opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(path, opts);
    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    const data = isJson ? await res.json() : await res.text();
    if (!res.ok) {
      const msg = isJson && data.error ? data.error : `Erro ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  function toast(message, type = 'info', ms = 4000) {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    document.getElementById('toasts').appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  /** Cria elemento com atributos e filhos. attrs.on = { evento: handler } */
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'on') {
        for (const [ev, fn] of Object.entries(value)) node.addEventListener(ev, fn);
      } else if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'html') node.innerHTML = value;
      else if (key === 'value') node.value = value;
      else if (key === 'checked') node.checked = value;
      else if (key === 'disabled') node.disabled = value;
      else node.setAttribute(key, value);
    }
    for (const child of [].concat(children)) {
      if (child === null || child === undefined) continue;
      node.append(child.nodeType ? child : document.createTextNode(child));
    }
    return node;
  }

  function fmtBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  }

  function fmtDate(iso) {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  /** Renderiza uma tabela simples de preview dentro do container. */
  function renderTable(container, headers, rows, options = {}) {
    container.innerHTML = '';
    if (!headers.length) {
      container.appendChild(el('div', { class: 'empty-state', text: options.emptyText || 'Sem dados para exibir.' }));
      return;
    }
    const thead = el('thead', {}, el('tr', {}, headers.map((h) => el('th', { text: h }))));
    const tbody = el(
      'tbody',
      {},
      rows.map((row) =>
        el('tr', {}, headers.map((h, idx) => {
          const value = Array.isArray(row) ? row[idx] : row[h];
          const text = value === null || value === undefined ? '' : String(value);
          return el('td', { text, title: text });
        }))
      )
    );
    const table = el('table', { class: 'data' }, [thead, tbody]);
    container.appendChild(el('div', { class: 'table-wrap' }, table));
  }

  /**
   * Controle de paginação. `state` = { page, pageSize, total, pageSizes }.
   * Retorna um elemento; chame .update(state) para re-renderizar.
   */
  function pagination(state, onChange) {
    const root = el('div', { class: 'pagination' });

    function update(s) {
      Object.assign(state, s);
      const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
      state.page = Math.min(Math.max(1, state.page), totalPages);
      root.innerHTML = '';
      root.append(
        el('button', { text: '« primeira', disabled: state.page <= 1, on: { click: () => onChange({ page: 1 }) } }),
        el('button', { text: '‹ anterior', disabled: state.page <= 1, on: { click: () => onChange({ page: state.page - 1 }) } }),
        el('span', { class: 'pg-info', text: `página ${state.page} / ${totalPages} · ${state.total} registros` }),
        el('button', { text: 'próxima ›', disabled: state.page >= totalPages, on: { click: () => onChange({ page: state.page + 1 }) } }),
        el('button', { text: 'última »', disabled: state.page >= totalPages, on: { click: () => onChange({ page: totalPages }) } }),
        el('span', { class: 'spacer' }),
        el('label', { class: 'pg-info', text: 'por página ' }, [
          el(
            'select',
            { on: { change: (e) => onChange({ pageSize: Number(e.target.value), page: 1 }) } },
            (state.pageSizes || [10, 25, 50, 100]).map((n) =>
              el('option', { value: n, text: String(n), ...(n === state.pageSize ? { selected: true } : {}) })
            )
          ),
        ])
      );
    }

    update(state);
    root.update = update;
    return root;
  }

  return { api, toast, el, fmtBytes, fmtDate, renderTable, pagination };
})();
