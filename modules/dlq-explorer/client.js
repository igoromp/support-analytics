(() => {
  const { api, toast, el, filePicker, pagination, fmtDate } = window.UI;

  // ---------------- tabs ----------------
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${tab.dataset.tab}`));
    });
  });

  // ---------------- conexões ----------------
  const connSelect = document.getElementById('conn-select');
  const connForm = document.getElementById('conn-form');
  const connList = document.getElementById('conn-list');

  document.getElementById('conn-toggle-form').addEventListener('click', () => connForm.classList.toggle('hidden'));

  document.getElementById('conn-save').addEventListener('click', async () => {
    try {
      await api('/api/dlq-explorer/connections', {
        method: 'POST',
        body: {
          name: document.getElementById('conn-name').value,
          connectionString: document.getElementById('conn-string').value,
        },
      });
      document.getElementById('conn-name').value = '';
      document.getElementById('conn-string').value = '';
      connForm.classList.add('hidden');
      toast('Conexão salva.', 'ok');
      loadConnections();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  async function removeConnection(c) {
    if (!confirm(`Excluir a conexão "${c.name}"?`)) return;
    await api(`/api/dlq-explorer/connections/${c.id}`, { method: 'DELETE' });
    toast('Conexão excluída.', 'ok');
    loadConnections();
  }

  async function loadConnections() {
    const conns = await api('/api/dlq-explorer/connections');
    const previous = connSelect.value;
    connSelect.innerHTML = '';
    connSelect.appendChild(el('option', { value: '', text: conns.length ? '— escolha a conexão —' : '(cadastre uma conexão)' }));
    conns.forEach((c) => connSelect.appendChild(el('option', { value: c.id, text: `${c.name} · ${c.endpoint}` })));
    if (previous && conns.some((c) => c.id === previous)) connSelect.value = previous;

    connList.innerHTML = '';
    if (conns.length) {
      connList.appendChild(el('div', { class: 'flex flex-wrap' }, conns.map((c) =>
        el('span', { class: 'badge badge-neutral', style: 'display:inline-flex;align-items:center;gap:6px' }, [
          `${c.name} (${c.endpoint})`,
          el('a', { href: '#', text: '✕', title: 'Excluir', style: 'color:var(--danger);text-decoration:none', on: { click: (e) => { e.preventDefault(); removeConnection(c); } } }),
        ])
      )));
    }
  }

  // ---------------- entidade ----------------
  const entityType = document.getElementById('entity-type');
  entityType.addEventListener('change', () => {
    const isQueue = entityType.value === 'queue';
    document.getElementById('queue-field').classList.toggle('hidden', !isQueue);
    document.getElementById('topic-field').classList.toggle('hidden', isQueue);
    document.getElementById('subscription-field').classList.toggle('hidden', isQueue);
  });

  function getEntity() {
    return entityType.value === 'queue'
      ? { type: 'queue', queue: document.getElementById('entity-queue').value.trim() }
      : {
          type: 'topic',
          topic: document.getElementById('entity-topic').value.trim(),
          subscription: document.getElementById('entity-subscription').value.trim(),
        };
  }

  function requireContext() {
    if (!connSelect.value) {
      toast('Escolha a conexão ativa.', 'error');
      return null;
    }
    const entity = getEntity();
    if ((entity.type === 'queue' && !entity.queue) || (entity.type === 'topic' && (!entity.topic || !entity.subscription))) {
      toast('Preencha os dados da fila/tópico.', 'error');
      return null;
    }
    return { connId: connSelect.value, entity };
  }

  const testResult = document.getElementById('test-result');
  document.getElementById('test-btn').addEventListener('click', async () => {
    const ctx = requireContext();
    if (!ctx) return;
    testResult.innerHTML = '<p class="muted small">testando…</p>';
    try {
      const result = await api('/api/dlq-explorer/test', { method: 'POST', body: ctx });
      testResult.innerHTML = '';
      const parts = [el('span', { class: 'badge badge-ok', text: '✓ conexão ok' })];
      if (result.counts) {
        parts.push(
          el('span', { class: 'badge badge-neutral', text: `ativas: ${result.counts.active}` }),
          el('span', { class: 'badge badge-danger', text: `dead letters: ${result.counts.dlq}` })
        );
      }
      testResult.appendChild(el('div', { class: 'flex flex-wrap', style: 'margin-top:4px' }, parts));
    } catch (err) {
      testResult.innerHTML = '';
      testResult.appendChild(el('span', { class: 'badge badge-danger', text: err.message }));
    }
  });

  // ---------------- export ----------------
  const exportResult = document.getElementById('export-result');
  document.getElementById('export-btn').addEventListener('click', async () => {
    const ctx = requireContext();
    if (!ctx) return;
    const btn = document.getElementById('export-btn');
    btn.disabled = true;
    btn.textContent = 'Exportando…';
    exportResult.innerHTML = '';
    try {
      const result = await api('/api/dlq-explorer/export', {
        method: 'POST',
        body: { ...ctx, max: Number(document.getElementById('export-max').value) },
      });
      exportResult.appendChild(el('p', { class: 'mono small' }, [
        `${result.total} mensagens exportadas → `,
        el('strong', { text: result.savedAs }),
        ' (pasta compartilhada)',
      ]));
      toast(`Export concluído: ${result.total} mensagens.`, 'ok');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Exportar DLQs';
    }
  });

  // ---------------- reprocess 1 a 1 ----------------
  const oneMessage = document.getElementById('one-message');
  const oneMeta = document.getElementById('one-meta');
  const oneBody = document.getElementById('one-body');
  let oneSession = null;

  document.getElementById('fetch-btn').addEventListener('click', async () => {
    const ctx = requireContext();
    if (!ctx) return;
    if (oneSession) {
      await api('/api/dlq-explorer/reprocess/release', { method: 'POST', body: { session: oneSession } }).catch(() => {});
      oneSession = null;
    }
    const btn = document.getElementById('fetch-btn');
    btn.disabled = true;
    btn.textContent = 'Buscando…';
    try {
      const result = await api('/api/dlq-explorer/reprocess/fetch', { method: 'POST', body: ctx });
      if (result.empty) {
        toast('A DLQ está vazia.', 'info');
        oneMessage.classList.add('hidden');
        return;
      }
      oneSession = result.session;
      const m = result.message;
      oneMeta.innerHTML = '';
      const entries = [
        ['messageId', m.messageId],
        ['sequenceNumber', m.sequenceNumber],
        ['enfileirada em', m.enqueuedTimeUtc],
        ['deliveryCount', m.deliveryCount],
        ['motivo DLQ', m.deadLetterReason],
        ['descrição', m.deadLetterErrorDescription],
      ];
      for (const [k, v] of entries) {
        if (v === undefined || v === null || v === '') continue;
        oneMeta.append(el('dt', { text: k }), el('dd', { text: String(v) }));
      }
      oneBody.value = result.bodyIsJson ? JSON.stringify(m.body, null, 2) : String(m.body ?? '');
      oneMessage.classList.remove('hidden');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Buscar próxima mensagem da DLQ';
    }
  });

  document.getElementById('one-send').addEventListener('click', async () => {
    if (!oneSession) return;
    try {
      await api('/api/dlq-explorer/reprocess/send', { method: 'POST', body: { session: oneSession, body: oneBody.value } });
      toast('Mensagem reenviada para a origem e removida da DLQ.', 'ok');
      oneSession = null;
      oneMessage.classList.add('hidden');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.getElementById('one-release').addEventListener('click', async () => {
    if (!oneSession) return;
    await api('/api/dlq-explorer/reprocess/release', { method: 'POST', body: { session: oneSession } }).catch(() => {});
    oneSession = null;
    oneMessage.classList.add('hidden');
    toast('Mensagem devolvida para a DLQ (intacta).', 'info');
  });

  window.addEventListener('beforeunload', () => {
    if (oneSession) navigator.sendBeacon('/api/dlq-explorer/reprocess/release', JSON.stringify({ session: oneSession }));
  });

  // ---------------- reprocess via CSV ----------------
  const keyColumnSelect = document.getElementById('batch-key-column');
  const rulesList = document.getElementById('batch-rules');
  const batchStatus = document.getElementById('batch-status');
  const batchSummary = document.getElementById('batch-summary');
  const batchErrors = document.getElementById('batch-errors');
  const batchPending = document.getElementById('batch-pending');

  const batchPicker = filePicker(document.getElementById('batch-picker'), {
    accept: ['csv', 'tsv', 'txt'],
    onChange: async (file) => {
      keyColumnSelect.innerHTML = '';
      if (!file) return;
      try {
        const data = await api('/api/csv-to-json/preview', { method: 'POST', body: file });
        keyColumnSelect.append(...data.headers.map((h, idx) => el('option', { value: h, text: `${h} (coluna ${idx + 1})` })));
        toast(`${data.total} linhas no CSV.`, 'info');
      } catch (err) {
        toast(err.message, 'error');
      }
    },
  });

  function addRule(path = '', spec = '') {
    const row = el('div', { class: 'form-row', style: 'margin-bottom:6px' }, [
      el('input', { type: 'text', class: 'mono rule-path', placeholder: 'ex.: settlement_tax.campo_x', value: path }),
      el('input', { type: 'text', class: 'mono rule-spec', placeholder: 'ex.: number:csv_2 · number:10 · string:XPTO', value: spec }),
      el('button', { class: 'btn btn-ghost shrink', type: 'button', text: '✕', style: 'color:var(--danger)', on: { click: () => row.remove() } }),
    ]);
    rulesList.appendChild(row);
  }
  document.getElementById('add-rule').addEventListener('click', () => addRule());
  addRule();

  // um objeto por aba: guarda o timer do polling daquele job (ver pollJob)
  const batchJobUi = {
    summaryEl: batchSummary,
    errorsEl: batchErrors,
    pendingEl: batchPending,
    totalLabel: 'chaves no CSV',
    pendingLabel: 'Chaves do CSV sem mensagem correspondente na DLQ',
  };

  document.getElementById('batch-run').addEventListener('click', async () => {
    const ctx = requireContext();
    if (!ctx) return;
    const file = batchPicker.getFile();
    if (!file) {
      toast('Escolha o arquivo CSV.', 'error');
      return;
    }
    const rules = [...rulesList.querySelectorAll('.form-row')].map((row) => ({
      path: row.querySelector('.rule-path').value.trim(),
      spec: row.querySelector('.rule-spec').value.trim(),
    })).filter((r) => r.path || r.spec);

    const btn = document.getElementById('batch-run');
    btn.disabled = true;
    try {
      const result = await api('/api/dlq-explorer/reprocess/csv', {
        method: 'POST',
        body: {
          ...ctx,
          file,
          keyColumn: keyColumnSelect.value,
          keyPath: document.getElementById('batch-key-path').value.trim(),
          rules,
        },
      });
      batchStatus.classList.remove('hidden');
      pollJob(result.jobId, btn, batchJobUi);
    } catch (err) {
      btn.disabled = false;
      toast(err.message, 'error');
    }
  });

  // ---------------- acompanhamento de job (usado pela listagem e pelo CSV) ----------------

  /**
   * Faz o polling de um job de reprocessamento e desenha o progresso nos elementos
   * dados. O timer fica no próprio `ui` para que jobs de abas diferentes rodando
   * ao mesmo tempo não cancelem o polling um do outro.
   */
  async function pollJob(jobId, btn, ui) {
    clearTimeout(ui.timer);
    try {
      const job = await api(`/api/dlq-explorer/jobs/${jobId}`);
      ui.summaryEl.textContent =
        `${job.status === 'running' ? 'processando' : 'finalizado'} · ${ui.totalLabel}: ${job.totalKeys} · ` +
        `varridas: ${job.scanned} · casadas: ${job.matched} · reenviadas: ${job.resent} · ` +
        `ignoradas: ${job.skipped} · falhas: ${job.failed}`;

      ui.errorsEl.innerHTML = '';
      if (job.errors && job.errors.length) {
        const table = el('table', { class: 'data' }, [
          el('thead', {}, el('tr', {}, ['mensagem', 'erro'].map((h) => el('th', { text: h })))),
          el('tbody', {}, job.errors.map((e) => el('tr', {}, [el('td', { text: e.ref }), el('td', { text: e.detail, title: e.detail })]))),
        ]);
        ui.errorsEl.appendChild(el('div', { class: 'table-wrap', style: 'max-height:220px;overflow-y:auto;margin-top:8px' }, table));
      }

      if (ui.pendingEl) {
        ui.pendingEl.innerHTML = '';
        if (job.status !== 'running' && job.pendingKeys && job.pendingKeys.length) {
          ui.pendingEl.appendChild(el('p', { class: 'small muted' }, [
            `${ui.pendingLabel} (${job.pendingKeys.length === 50 ? '50+' : job.pendingKeys.length}): `,
            el('code', { text: job.pendingKeys.join(', ') }),
          ]));
        }
      }

      if (job.status === 'running') {
        ui.timer = setTimeout(() => pollJob(jobId, btn, ui), 1000);
      } else {
        btn.disabled = false;
        if (ui.onDone) ui.onDone(job);
        toast(
          job.status === 'finished' ? `Reprocessamento concluído: ${job.resent} mensagens reenviadas.` : 'Reprocessamento terminou com erro.',
          job.status === 'finished' ? 'ok' : 'error'
        );
      }
    } catch (err) {
      btn.disabled = false;
      toast(err.message, 'error');
    }
  }

  // ---------------- visualizar dead letters ----------------
  const viewTable = document.getElementById('view-table');
  const viewEmpty = document.getElementById('view-empty');
  const viewActions = document.getElementById('view-actions');
  const viewStatus = document.getElementById('view-status');
  const viewFilter = document.getElementById('view-filter');
  const viewLoadBtn = document.getElementById('view-load');
  const viewReprocessBtn = document.getElementById('view-reprocess');

  const viewJobUi = {
    summaryEl: document.getElementById('view-summary'),
    errorsEl: document.getElementById('view-errors'),
    totalLabel: 'selecionadas',
    // as reenviadas saíram da DLQ: recarrega para a lista refletir o broker
    onDone: () => viewLoadBtn.click(),
  };

  let allMessages = [];
  const selected = new Set();
  const pageState = { page: 1, pageSize: 25, total: 0, pageSizes: [10, 25, 50, 100] };
  const viewPagination = pagination(pageState, (next) => {
    Object.assign(pageState, next);
    renderMessages();
  });
  document.getElementById('view-pagination').appendChild(viewPagination);

  /** Trecho legível do body para a coluna de prévia. */
  function bodyPreview(body) {
    const text = typeof body === 'object' && body !== null ? JSON.stringify(body) : String(body ?? '');
    return text.length > 90 ? `${text.slice(0, 90)}…` : text;
  }

  function filteredMessages() {
    const term = viewFilter.value.trim().toLowerCase();
    if (!term) return allMessages;
    return allMessages.filter((m) => {
      const haystack = [m.messageId, m.deadLetterReason, m.deadLetterErrorDescription, bodyPreview(m.body)]
        .filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }

  function updateSelectionUi() {
    viewActions.classList.toggle('hidden', allMessages.length === 0);
    viewReprocessBtn.disabled = selected.size === 0;
    viewReprocessBtn.textContent = selected.size
      ? `Reprocessar ${selected.size} selecionada(s)`
      : 'Reprocessar selecionadas';
  }

  function renderMessages() {
    const rows = filteredMessages();
    pageState.total = rows.length;
    const start = (pageState.page - 1) * pageState.pageSize;
    const pageRows = rows.slice(start, start + pageState.pageSize);

    viewEmpty.classList.toggle('hidden', allMessages.length > 0);
    viewTable.innerHTML = '';

    if (allMessages.length && !rows.length) {
      viewTable.appendChild(el('div', { class: 'empty-state', text: 'Nenhuma mensagem corresponde ao filtro.' }));
      viewPagination.update(pageState);
      updateSelectionUi();
      return;
    }

    const selectAll = el('input', {
      type: 'checkbox',
      title: 'Selecionar todas as mensagens do filtro atual',
      checked: rows.length > 0 && rows.every((m) => selected.has(m.sequenceNumber)),
      on: {
        change: (e) => {
          for (const m of rows) {
            if (e.target.checked) selected.add(m.sequenceNumber);
            else selected.delete(m.sequenceNumber);
          }
          renderMessages();
        },
      },
    });

    const headers = ['enfileirada em', 'messageId', 'tentativas', 'motivo DLQ', 'body'];
    const tbody = el('tbody');

    for (const m of pageRows) {
      const detail = el('tr', { class: 'hidden' }, el('td', { colspan: String(headers.length + 1) }, [
        el('pre', { class: 'mono small', style: 'white-space:pre-wrap;margin:0', text: typeof m.body === 'object' && m.body !== null ? JSON.stringify(m.body, null, 2) : String(m.body ?? '') }),
        m.deadLetterErrorDescription ? el('p', { class: 'small muted', style: 'margin:6px 0 0', text: m.deadLetterErrorDescription }) : null,
      ]));

      const check = el('input', {
        type: 'checkbox',
        checked: selected.has(m.sequenceNumber),
        on: {
          click: (e) => e.stopPropagation(), // não alterna o detalhe da linha
          change: (e) => {
            if (e.target.checked) selected.add(m.sequenceNumber);
            else selected.delete(m.sequenceNumber);
            updateSelectionUi();
          },
        },
      });

      const row = el('tr', {
        style: 'cursor:pointer',
        title: 'Clique para ver o body completo',
        on: { click: () => detail.classList.toggle('hidden') },
      }, [
        el('td', {}, check),
        el('td', { text: m.enqueuedTimeUtc ? fmtDate(m.enqueuedTimeUtc) : '' }),
        el('td', { class: 'mono', text: m.messageId || '' }),
        el('td', { text: String(m.deliveryCount ?? '') }),
        el('td', { text: m.deadLetterReason || '', title: m.deadLetterErrorDescription || '' }),
        el('td', { class: 'mono small', text: bodyPreview(m.body) }),
      ]);

      tbody.append(row, detail);
    }

    const table = el('table', { class: 'data' }, [
      el('thead', {}, el('tr', {}, [el('th', {}, selectAll), ...headers.map((h) => el('th', { text: h }))])),
      tbody,
    ]);
    viewTable.appendChild(el('div', { class: 'table-wrap' }, table));
    viewPagination.update(pageState);
    updateSelectionUi();
  }

  viewFilter.addEventListener('input', () => {
    pageState.page = 1;
    renderMessages();
  });

  viewLoadBtn.addEventListener('click', async () => {
    const ctx = requireContext();
    if (!ctx) return;
    viewLoadBtn.disabled = true;
    viewLoadBtn.textContent = 'Carregando…';
    viewStatus.classList.add('hidden');
    try {
      const result = await api('/api/dlq-explorer/peek', {
        method: 'POST',
        body: { ...ctx, max: Number(document.getElementById('view-max').value) },
      });
      allMessages = result.messages;
      selected.clear();
      pageState.page = 1;
      renderMessages();
      toast(result.total ? `${result.total} dead letters carregadas.` : 'A DLQ está vazia.', result.total ? 'ok' : 'info');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      viewLoadBtn.disabled = false;
      viewLoadBtn.textContent = 'Carregar dead letters';
    }
  });

  document.getElementById('view-clear-selection').addEventListener('click', () => {
    selected.clear();
    renderMessages();
  });

  viewReprocessBtn.addEventListener('click', async () => {
    const ctx = requireContext();
    if (!ctx) return;
    if (!selected.size) return;
    if (!confirm(`Reenviar ${selected.size} mensagem(ns) para a origem? Elas saem da DLQ.`)) return;

    viewReprocessBtn.disabled = true;
    viewStatus.classList.remove('hidden');
    try {
      const result = await api('/api/dlq-explorer/reprocess/selected', {
        method: 'POST',
        body: { ...ctx, sequenceNumbers: [...selected] },
      });
      pollJob(result.jobId, viewReprocessBtn, viewJobUi);
    } catch (err) {
      viewReprocessBtn.disabled = false;
      toast(err.message, 'error');
    }
  });

  loadConnections();
})();
