// Componentes compartilhados entre módulos.
// Dependem de window.UI (shell.js) e das rotas do módulo "files".

(() => {
  const { el, api, toast, fmtBytes } = window.UI;

  /**
   * Seletor de arquivo com duas origens:
   *  - pasta compartilhada (data/shared)
   *  - upload de outro arquivo (vai para data/tmp, sem poluir a pasta compartilhada)
   *
   * options: { accept: ['csv','json'], onChange(fileRef|null) }
   * fileRef = { source: 'shared'|'tmp', name }
   */
  function filePicker(container, options = {}) {
    const accept = options.accept || [];
    let current = null;
    let mode = 'shared';

    const select = el('select', { class: 'mono' });
    const refreshBtn = el('button', {
      class: 'btn btn-secondary btn-sm',
      type: 'button',
      text: '↻',
      title: 'Recarregar lista',
      on: { click: () => loadShared() },
    });
    const sharedRow = el('div', { class: 'file-picker-row' }, [select, refreshBtn]);

    const fileInput = el('input', { type: 'file', class: 'hidden', ...(accept.length ? { accept: accept.map((e) => '.' + e).join(',') } : {}) });
    const drop = el('div', { class: 'file-drop', text: 'Clique ou arraste um arquivo aqui' });
    const uploadArea = el('div', { class: 'hidden' }, [drop, fileInput]);

    const selected = el('div', { class: 'file-picker-selected' });

    function setFile(fileRef) {
      current = fileRef;
      selected.textContent = fileRef ? `✓ ${fileRef.name} (${fileRef.source === 'shared' ? 'pasta compartilhada' : 'upload'})` : '';
      if (options.onChange) options.onChange(fileRef);
    }

    async function loadShared() {
      try {
        const files = await api('/api/files/list');
        const filtered = accept.length ? files.filter((f) => accept.includes(f.ext)) : files;
        select.innerHTML = '';
        select.appendChild(el('option', { value: '', text: filtered.length ? '— escolha um arquivo —' : '(nenhum arquivo compatível na pasta)' }));
        for (const f of filtered) {
          select.appendChild(el('option', { value: f.name, text: `${f.name} · ${fmtBytes(f.size)}` }));
        }
      } catch (err) {
        toast(`Falha ao listar a pasta compartilhada: ${err.message}`, 'error');
      }
    }

    select.addEventListener('change', () => {
      setFile(select.value ? { source: 'shared', name: select.value } : null);
    });

    async function upload(file) {
      if (!file) return;
      if (accept.length && !accept.includes(file.name.split('.').pop().toLowerCase())) {
        toast(`Extensão não suportada aqui. Esperado: ${accept.join(', ')}`, 'error');
        return;
      }
      const form = new FormData();
      form.append('file', file);
      try {
        const result = await api('/api/files/upload?dest=tmp', { method: 'POST', body: form });
        drop.textContent = 'Clique ou arraste um arquivo aqui';
        setFile({ source: 'tmp', name: result.name });
      } catch (err) {
        toast(`Falha no upload: ${err.message}`, 'error');
      }
    }

    drop.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => upload(fileInput.files[0]));
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('dragover');
      upload(e.dataTransfer.files[0]);
    });

    const modes = el('div', { class: 'file-picker-modes' }, [
      el('label', {}, [
        el('input', { type: 'radio', name: `fp-mode-${Math.random().toString(36).slice(2, 7)}`, checked: true, on: { change: () => switchMode('shared') } }),
        ' Pasta compartilhada',
      ]),
      el('label', {}, [
        el('input', { type: 'radio', name: 'fp-mode-x', on: { change: () => switchMode('upload') } }),
        ' Enviar outro arquivo',
      ]),
    ]);
    // garante que os dois radios compartilhem o mesmo name
    const radios = modes.querySelectorAll('input[type=radio]');
    const groupName = radios[0].name;
    radios[1].name = groupName;

    function switchMode(next) {
      mode = next;
      sharedRow.classList.toggle('hidden', mode !== 'shared');
      uploadArea.classList.toggle('hidden', mode !== 'upload');
      setFile(null);
      select.value = '';
    }

    container.classList.add('file-picker');
    container.append(modes, sharedRow, uploadArea, selected);
    loadShared();

    return {
      getFile: () => current,
      reloadShared: loadShared,
    };
  }

  /**
   * Lista de campos com seleção e renomeação.
   * options: { fields: string[], onChange() }
   * getSelection() → [{ field, rename }] apenas dos marcados, na ordem original.
   */
  function fieldMapper(container, options = {}) {
    const rows = [];
    container.innerHTML = '';

    const toolbar = el('div', { class: 'flex', style: 'margin-bottom:8px' }, [
      el('button', { class: 'btn btn-secondary btn-sm', type: 'button', text: 'Marcar todos', on: { click: () => setAll(true) } }),
      el('button', { class: 'btn btn-secondary btn-sm', type: 'button', text: 'Desmarcar todos', on: { click: () => setAll(false) } }),
    ]);

    const table = el('table', { class: 'data' }, [
      el('thead', {}, el('tr', {}, [el('th', { text: '' }), el('th', { text: 'campo de origem' }), el('th', { text: 'renomear para (opcional)' })])),
    ]);
    const tbody = el('tbody');
    table.appendChild(tbody);

    for (const field of options.fields || []) {
      const check = el('input', { type: 'checkbox', checked: true, on: { change: notify } });
      const rename = el('input', { type: 'text', class: 'mono', placeholder: field, on: { input: notify } });
      tbody.appendChild(el('tr', {}, [
        el('td', {}, check),
        el('td', {}, el('code', { text: field })),
        el('td', {}, rename),
      ]));
      rows.push({ field, check, rename });
    }

    function setAll(value) {
      rows.forEach((r) => { r.check.checked = value; });
      notify();
    }

    function notify() {
      if (options.onChange) options.onChange();
    }

    container.append(toolbar, el('div', { class: 'table-wrap' }, table));

    return {
      getSelection: () =>
        rows
          .filter((r) => r.check.checked)
          .map((r) => ({ field: r.field, rename: r.rename.value.trim() || r.field })),
    };
  }

  /** Dispara download de conteúdo gerado no navegador. */
  function download(filename, content, mime = 'application/octet-stream') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /** Salva conteúdo na pasta compartilhada via módulo files. */
  async function saveToShared(name, content) {
    const result = await api('/api/files/save', { method: 'POST', body: { name, content } });
    return result.name;
  }

  Object.assign(window.UI, { filePicker, fieldMapper, download, saveToShared });
})();
