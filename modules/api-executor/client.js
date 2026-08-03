(() => {
  const { api, toast, el, filePicker } = window.UI;

  // ---------------- tabs ----------------
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${tab.dataset.tab}`));
    });
  });

  // ---------------- cadastro de APIs ----------------
  const nameInput = document.getElementById('api-name');
  const methodSelect = document.getElementById('api-method');
  const urlInput = document.getElementById('api-url');
  const bodyInput = document.getElementById('api-body');
  const hasResponseCheck = document.getElementById('api-has-response');
  const queryList = document.getElementById('api-query-list');
  const headersList = document.getElementById('api-headers-list');
  const apiListEl = document.getElementById('api-list');
  const formTitle = document.getElementById('api-form-title');
  const saveBtn = document.getElementById('api-save-btn');
  const cancelBtn = document.getElementById('api-cancel-btn');
  const runApiSelect = document.getElementById('run-api');

  let editingId = null;
  let apis = [];

  function kvRow(container, key = '', value = '') {
    const row = el('div', { class: 'form-row', style: 'margin-bottom:6px' }, [
      el('input', { type: 'text', class: 'mono kv-key', placeholder: 'nome', value: key }),
      el('input', { type: 'text', class: 'mono kv-value', placeholder: 'valor (aceita {{campo}})', value }),
      el('button', { class: 'btn btn-ghost shrink', type: 'button', text: '✕', style: 'color:var(--danger)', on: { click: () => row.remove() } }),
    ]);
    container.appendChild(row);
  }

  function readKvList(container) {
    return [...container.querySelectorAll('.form-row')].map((row) => ({
      key: row.querySelector('.kv-key').value.trim(),
      value: row.querySelector('.kv-value').value,
    })).filter((kv) => kv.key);
  }

  document.getElementById('add-query').addEventListener('click', () => kvRow(queryList));
  document.getElementById('add-header').addEventListener('click', () => kvRow(headersList));

  function resetForm() {
    editingId = null;
    formTitle.textContent = 'Cadastrar nova API';
    saveBtn.textContent = 'Salvar API';
    cancelBtn.classList.add('hidden');
    nameInput.value = '';
    methodSelect.value = 'GET';
    urlInput.value = '';
    bodyInput.value = '';
    hasResponseCheck.checked = true;
    queryList.innerHTML = '';
    headersList.innerHTML = '';
  }

  cancelBtn.addEventListener('click', resetForm);

  saveBtn.addEventListener('click', async () => {
    const payload = {
      name: nameInput.value,
      method: methodSelect.value,
      url: urlInput.value,
      query: readKvList(queryList),
      headers: readKvList(headersList),
      bodyTemplate: bodyInput.value,
      hasResponse: hasResponseCheck.checked,
    };
    try {
      if (editingId) {
        await api(`/api/api-executor/apis/${editingId}`, { method: 'PUT', body: payload });
        toast('API atualizada.', 'ok');
      } else {
        await api('/api/api-executor/apis', { method: 'POST', body: payload });
        toast('API cadastrada.', 'ok');
      }
      resetForm();
      loadApis();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  function editApi(a) {
    editingId = a.id;
    formTitle.textContent = `Editando: ${a.name}`;
    saveBtn.textContent = 'Salvar alterações';
    cancelBtn.classList.remove('hidden');
    nameInput.value = a.name;
    methodSelect.value = a.method;
    urlInput.value = a.url;
    bodyInput.value = a.bodyTemplate || '';
    hasResponseCheck.checked = a.hasResponse !== false;
    queryList.innerHTML = '';
    headersList.innerHTML = '';
    (a.query || []).forEach((q) => kvRow(queryList, q.key, q.value));
    (a.headers || []).forEach((h) => kvRow(headersList, h.key, h.value));
    document.querySelector('[data-tab=apis]').click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function removeApi(a) {
    if (!confirm(`Excluir a API "${a.name}"?`)) return;
    try {
      await api(`/api/api-executor/apis/${a.id}`, { method: 'DELETE' });
      toast('API excluída.', 'ok');
      loadApis();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function loadApis() {
    apis = await api('/api/api-executor/apis');
    apiListEl.innerHTML = '';
    if (!apis.length) {
      apiListEl.appendChild(el('div', { class: 'empty-state', text: 'Nenhuma API cadastrada ainda.' }));
    } else {
      const table = el('table', { class: 'data' }, [
        el('thead', {}, el('tr', {}, ['nome', 'verbo', 'url', ''].map((h) => el('th', { text: h })))),
        el('tbody', {}, apis.map((a) =>
          el('tr', {}, [
            el('td', { text: a.name }),
            el('td', {}, el('span', { class: 'badge badge-accent', text: a.method })),
            el('td', { text: a.url, title: a.url }),
            el('td', {}, el('div', { class: 'flex' }, [
              el('button', { class: 'btn btn-ghost btn-sm', text: 'editar', on: { click: () => editApi(a) } }),
              el('button', { class: 'btn btn-ghost btn-sm', style: 'color:var(--danger)', text: 'excluir', on: { click: () => removeApi(a) } }),
            ])),
          ])
        )),
      ]);
      apiListEl.appendChild(el('div', { class: 'table-wrap' }, table));
    }
    // atualiza o select da aba Executar
    runApiSelect.innerHTML = '';
    runApiSelect.appendChild(el('option', { value: '', text: apis.length ? '— escolha a API —' : '(cadastre uma API primeiro)' }));
    apis.forEach((a) => runApiSelect.appendChild(el('option', { value: a.id, text: `${a.method} · ${a.name}` })));
  }

  // ---------------- execução ----------------
  const runFieldsWrap = document.getElementById('run-fields');
  const runFieldsList = document.getElementById('run-fields-list');
  const saveEnabled = document.getElementById('save-enabled');
  const saveOptions = document.getElementById('save-options');
  const saveMode = document.getElementById('save-mode');
  const saveFieldsWrap = document.getElementById('save-fields-wrap');
  const saveFieldsList = document.getElementById('save-fields-list');
  const runBtn = document.getElementById('run-btn');
  const jobStatus = document.getElementById('job-status');
  const jobProgress = document.getElementById('job-progress');
  const jobSummary = document.getElementById('job-summary');
  const jobErrors = document.getElementById('job-errors');

  const picker = filePicker(document.getElementById('run-picker'), {
    accept: ['csv', 'json', 'tsv', 'txt'],
    onChange: async (file) => {
      runFieldsWrap.classList.add('hidden');
      if (!file) return;
      try {
        const data = await api('/api/api-executor/fields', { method: 'POST', body: file });
        runFieldsList.innerHTML = '';
        data.fields.forEach((f) => runFieldsList.appendChild(el('code', { class: 'badge badge-neutral', text: `{{${f}}}` })));
        runFieldsWrap.classList.remove('hidden');
        toast(`${data.total} registros no arquivo.`, 'info');
      } catch (err) {
        toast(err.message, 'error');
      }
    },
  });

  saveEnabled.addEventListener('change', () => saveOptions.classList.toggle('hidden', !saveEnabled.checked));
  saveMode.addEventListener('change', () => saveFieldsWrap.classList.toggle('hidden', saveMode.value !== 'fields'));

  document.getElementById('add-save-field').addEventListener('click', () => {
    const row = el('div', { class: 'form-row', style: 'margin-bottom:6px' }, [
      el('input', { type: 'text', class: 'mono sf-path', placeholder: 'caminho no retorno · ex.: data.status' }),
      el('input', { type: 'text', class: 'mono sf-rename', placeholder: 'renomear para (opcional)' }),
      el('button', { class: 'btn btn-ghost shrink', type: 'button', text: '✕', style: 'color:var(--danger)', on: { click: () => row.remove() } }),
    ]);
    saveFieldsList.appendChild(row);
  });

  let pollTimer = null;

  runBtn.addEventListener('click', async () => {
    if (!runApiSelect.value) {
      toast('Escolha uma API cadastrada.', 'error');
      return;
    }
    const saveConfig = saveEnabled.checked
      ? {
          enabled: true,
          format: document.getElementById('save-format').value,
          mode: saveMode.value,
          filename: document.getElementById('save-filename').value,
          fields: [...saveFieldsList.querySelectorAll('.form-row')].map((row) => ({
            path: row.querySelector('.sf-path').value.trim(),
            rename: row.querySelector('.sf-rename').value.trim(),
          })).filter((f) => f.path),
        }
      : { enabled: false };

    runBtn.disabled = true;
    try {
      const result = await api('/api/api-executor/run', {
        method: 'POST',
        body: {
          apiId: runApiSelect.value,
          file: picker.getFile() || undefined,
          workers: Number(document.getElementById('run-workers').value),
          timeoutSeconds: Number(document.getElementById('run-timeout').value),
          save: saveConfig,
        },
      });
      jobStatus.classList.remove('hidden');
      poll(result.jobId);
    } catch (err) {
      toast(err.message, 'error');
      runBtn.disabled = false;
    }
  });

  async function poll(jobId) {
    clearTimeout(pollTimer);
    try {
      const job = await api(`/api/api-executor/jobs/${jobId}`);
      const pct = job.total ? Math.round((job.done / job.total) * 100) : 0;
      jobProgress.style.width = pct + '%';
      jobSummary.textContent = `${job.status === 'running' ? 'executando' : 'finalizado'} · ${job.done}/${job.total} · ok: ${job.ok} · falhas: ${job.failed}` +
        (job.savedAs ? ` · salvo como: ${job.savedAs}` : '');
      renderErrors(job.errors);
      if (job.status === 'running') {
        pollTimer = setTimeout(() => poll(jobId), 800);
      } else {
        runBtn.disabled = false;
        toast(job.failed === 0 ? 'Execução concluída sem falhas.' : `Execução concluída com ${job.failed} falha(s).`, job.failed === 0 ? 'ok' : 'error');
        if (job.savedAs) picker.reloadShared();
      }
    } catch (err) {
      runBtn.disabled = false;
      toast(err.message, 'error');
    }
  }

  function renderErrors(errors) {
    jobErrors.innerHTML = '';
    if (!errors || !errors.length) return;
    const table = el('table', { class: 'data' }, [
      el('thead', {}, el('tr', {}, ['linha', 'status', 'detalhe'].map((h) => el('th', { text: h })))),
      el('tbody', {}, errors.map((e) =>
        el('tr', {}, [
          el('td', { text: String(e.index) }),
          el('td', {}, el('span', { class: 'badge badge-danger', text: String(e.status) })),
          el('td', { text: e.detail || '', title: e.detail || '' }),
        ])
      )),
    ]);
    jobErrors.appendChild(el('div', { class: 'table-wrap', style: 'max-height:280px;overflow-y:auto' }, table));
  }

  loadApis();
})();
