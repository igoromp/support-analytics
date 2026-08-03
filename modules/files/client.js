(() => {
  const { api, toast, el, fmtBytes, fmtDate } = window.UI;

  const drop = document.getElementById('upload-drop');
  const input = document.getElementById('upload-input');
  const listEl = document.getElementById('file-list');
  const previewCard = document.getElementById('preview-card');
  const previewName = document.getElementById('preview-name');
  const previewContent = document.getElementById('preview-content');

  async function refresh() {
    const files = await api('/api/files/list');
    listEl.innerHTML = '';
    if (!files.length) {
      listEl.appendChild(el('div', { class: 'empty-state', text: 'A pasta compartilhada está vazia. Envie o primeiro arquivo acima.' }));
      return;
    }
    const table = el('table', { class: 'data' }, [
      el('thead', {}, el('tr', {}, ['arquivo', 'tipo', 'tamanho', 'modificado em', ''].map((h) => el('th', { text: h })))),
      el('tbody', {}, files.map((f) =>
        el('tr', {}, [
          el('td', { text: f.name, title: f.name }),
          el('td', {}, el('span', { class: 'badge badge-neutral', text: f.ext || '—' })),
          el('td', { text: fmtBytes(f.size) }),
          el('td', { text: fmtDate(f.modifiedAt) }),
          el('td', {}, el('div', { class: 'flex' }, [
            el('button', { class: 'btn btn-ghost btn-sm', text: 'preview', on: { click: () => preview(f.name) } }),
            el('a', { class: 'btn btn-ghost btn-sm', text: 'baixar', href: `/api/files/download/${encodeURIComponent(f.name)}` }),
            el('button', { class: 'btn btn-ghost btn-sm', style: 'color:var(--danger)', text: 'excluir', on: { click: () => removeFile(f.name) } }),
          ])),
        ])
      )),
    ]);
    listEl.appendChild(el('div', { class: 'table-wrap' }, table));
  }

  async function preview(name) {
    try {
      const data = await api(`/api/files/preview/${encodeURIComponent(name)}`);
      previewName.textContent = name;
      previewContent.textContent = data.content + (data.truncated ? '\n\n… (arquivo truncado no preview)' : '');
      previewCard.classList.remove('hidden');
      previewCard.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function removeFile(name) {
    if (!confirm(`Excluir "${name}" da pasta compartilhada?`)) return;
    try {
      await api(`/api/files/${encodeURIComponent(name)}`, { method: 'DELETE' });
      toast(`"${name}" excluído.`, 'ok');
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function uploadFiles(files) {
    for (const file of files) {
      const form = new FormData();
      form.append('file', file);
      try {
        const result = await api('/api/files/upload', { method: 'POST', body: form });
        toast(`"${result.name}" enviado (${fmtBytes(result.size)}).`, 'ok');
      } catch (err) {
        toast(`Falha ao enviar "${file.name}": ${err.message}`, 'error');
      }
    }
    refresh();
  }

  drop.addEventListener('click', () => input.click());
  input.addEventListener('change', () => uploadFiles([...input.files]));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
    uploadFiles([...e.dataTransfer.files]);
  });

  refresh();
})();
