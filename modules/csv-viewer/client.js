(() => {
  const { api, toast, el, filePicker, pagination } = window.UI;

  const openBtn = document.getElementById('open-btn');
  const viewerCard = document.getElementById('viewer-card');
  const fileLabel = document.getElementById('file-label');
  const tableEl = document.getElementById('table');
  const globalInput = document.getElementById('global-filter');
  const clearBtn = document.getElementById('clear-filters');

  let session = null;
  let headers = [];
  const state = { page: 1, pageSize: 25, total: 0, pageSizes: [10, 25, 50, 100] };
  const columnFilters = {}; // idx → termo
  let debounceTimer = null;

  const picker = filePicker(document.getElementById('picker'), {
    accept: ['csv', 'txt', 'tsv'],
    onChange: (file) => { openBtn.disabled = !file; },
  });

  const pagTop = pagination(state, onPageChange);
  const pagBottom = pagination({ ...state }, onPageChange);
  document.getElementById('pagination-top').appendChild(pagTop);
  document.getElementById('pagination-bottom').appendChild(pagBottom);

  function onPageChange(patch) {
    Object.assign(state, patch);
    loadPage();
  }

  openBtn.addEventListener('click', async () => {
    const file = picker.getFile();
    if (!file) return;
    openBtn.disabled = true;
    openBtn.textContent = 'Abrindo…';
    try {
      const data = await api('/api/csv-viewer/open', { method: 'POST', body: file });
      session = data.session;
      headers = data.headers;
      state.page = 1;
      state.total = data.total;
      Object.keys(columnFilters).forEach((k) => delete columnFilters[k]);
      globalInput.value = '';
      fileLabel.textContent = `${file.name} · ${data.total} registros`;
      viewerCard.classList.remove('hidden');
      await loadPage();
      viewerCard.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      openBtn.disabled = false;
      openBtn.textContent = 'Abrir arquivo';
    }
  });

  function debouncedReload() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      state.page = 1;
      loadPage();
    }, 300);
  }

  globalInput.addEventListener('input', debouncedReload);

  clearBtn.addEventListener('click', () => {
    globalInput.value = '';
    Object.keys(columnFilters).forEach((k) => delete columnFilters[k]);
    state.page = 1;
    loadPage();
  });

  async function loadPage() {
    if (!session) return;
    try {
      const data = await api('/api/csv-viewer/page', {
        method: 'POST',
        body: {
          session,
          page: state.page,
          pageSize: state.pageSize,
          global: globalInput.value,
          columnFilters,
        },
      });
      state.total = data.total;
      renderTable(data.rows);
      pagTop.update({ ...state });
      pagBottom.update({ ...state });
    } catch (err) {
      if (err.message.includes('Sessão expirada')) {
        toast('A sessão expirou — abra o arquivo novamente.', 'error');
        viewerCard.classList.add('hidden');
        session = null;
      } else {
        toast(err.message, 'error');
      }
    }
  }

  function renderTable(rows) {
    tableEl.innerHTML = '';

    const filterRow = el('tr', {}, headers.map((_, idx) => {
      const input = el('input', {
        type: 'text',
        class: 'mono',
        placeholder: 'filtrar…',
        value: columnFilters[idx] || '',
        style: 'min-width:90px;padding:4px 7px;font-size:11.5px',
        on: {
          input: (e) => {
            if (e.target.value) columnFilters[idx] = e.target.value;
            else delete columnFilters[idx];
            debouncedReload();
          },
        },
      });
      return el('th', { style: 'padding:4px 8px' }, input);
    }));

    const table = el('table', { class: 'data' }, [
      el('thead', {}, [
        el('tr', {}, headers.map((h) => el('th', { text: h }))),
        filterRow,
      ]),
      el('tbody', {}, rows.length
        ? rows.map((row) => el('tr', {}, row.map((cell) => el('td', { text: cell ?? '', title: cell ?? '' }))))
        : [el('tr', {}, el('td', { colspan: headers.length }, el('div', { class: 'empty-state', text: 'Nenhum registro corresponde aos filtros.' })))]),
    ]);

    tableEl.appendChild(el('div', { class: 'table-wrap', style: 'max-height:600px;overflow-y:auto' }, table));
  }
})();
