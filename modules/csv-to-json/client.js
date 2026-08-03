(() => {
  const { api, toast, el, filePicker, fieldMapper, renderTable, download } = window.UI;

  const previewBtn = document.getElementById('preview-btn');
  const previewCard = document.getElementById('preview-card');
  const previewInfo = document.getElementById('preview-info');
  const previewTable = document.getElementById('preview-table');
  const fieldsCard = document.getElementById('fields-card');
  const fixedCard = document.getElementById('fixed-card');
  const fixedList = document.getElementById('fixed-list');
  const outputCard = document.getElementById('output-card');
  const nestedOption = document.getElementById('nested-option');
  const outFilename = document.getElementById('out-filename');
  const resultWrap = document.getElementById('result-preview-wrap');
  const resultPreview = document.getElementById('result-preview');

  let mapper = null;
  let currentFile = null;

  const picker = filePicker(document.getElementById('picker'), {
    accept: ['csv', 'txt', 'tsv'],
    onChange: (file) => { previewBtn.disabled = !file; },
  });

  previewBtn.addEventListener('click', async () => {
    const file = picker.getFile();
    if (!file) return;
    previewBtn.disabled = true;
    try {
      const data = await api('/api/csv-to-json/preview', { method: 'POST', body: file });
      currentFile = file;
      previewInfo.textContent = `${data.total} registros · ${data.headers.length} colunas`;
      renderTable(previewTable, data.headers, data.rows);
      mapper = fieldMapper(document.getElementById('field-mapper'), { fields: data.headers });
      nestedOption.classList.toggle('hidden', !data.hasDotNotation);
      outFilename.value = file.name.replace(/\.(csv|txt|tsv)$/i, '') + '.json';
      [previewCard, fieldsCard, fixedCard, outputCard].forEach((c) => c.classList.remove('hidden'));
      resultWrap.classList.add('hidden');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      previewBtn.disabled = false;
    }
  });

  document.getElementById('add-fixed').addEventListener('click', () => addFixedRow());

  function addFixedRow() {
    const row = el('div', { class: 'form-row', style: 'margin-bottom:8px' }, [
      el('label', { class: 'field' }, [
        el('span', { text: 'nome do campo' }),
        el('input', { type: 'text', class: 'mono fixed-name', placeholder: 'ex.: origem ou meta.origem' }),
      ]),
      el('label', { class: 'field shrink', style: 'min-width:110px' }, [
        el('span', { text: 'tipo' }),
        el('select', { class: 'fixed-type' }, [
          el('option', { value: 'string', text: 'string' }),
          el('option', { value: 'number', text: 'number' }),
          el('option', { value: 'boolean', text: 'boolean' }),
        ]),
      ]),
      el('label', { class: 'field' }, [
        el('span', { text: 'valor' }),
        el('input', { type: 'text', class: 'mono fixed-value', placeholder: 'ex.: reprocessamento' }),
      ]),
      el('button', {
        class: 'btn btn-ghost shrink',
        type: 'button',
        text: '✕',
        title: 'Remover',
        style: 'color:var(--danger)',
        on: { click: () => row.remove() },
      }),
    ]);
    fixedList.appendChild(row);
  }

  function getFixedFields() {
    return [...fixedList.querySelectorAll('.form-row')].map((row) => ({
      name: row.querySelector('.fixed-name').value.trim(),
      type: row.querySelector('.fixed-type').value,
      value: row.querySelector('.fixed-value').value,
    })).filter((f) => f.name);
  }

  function buildPayload(save) {
    const nested = !nestedOption.classList.contains('hidden')
      ? document.querySelector('input[name=nested]:checked').value === 'nested'
      : false;
    return {
      ...currentFile,
      fields: mapper.getSelection(),
      fixedFields: getFixedFields(),
      nested,
      save,
      filename: outFilename.value,
    };
  }

  async function convert(save) {
    if (!currentFile || !mapper) return;
    if (!mapper.getSelection().length) {
      toast('Selecione ao menos um campo.', 'error');
      return;
    }
    try {
      const result = await api('/api/csv-to-json/convert', { method: 'POST', body: buildPayload(save) });
      if (save) {
        toast(`Salvo na pasta compartilhada como "${result.savedAs}" (${result.total} itens).`, 'ok');
        picker.reloadShared();
      } else {
        download(outFilename.value || 'resultado.json', result.content, 'application/json');
        toast(`JSON gerado com ${result.total} itens.`, 'ok');
        showResultPreview(result.content);
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function showResultPreview(content) {
    try {
      const items = JSON.parse(content);
      resultPreview.textContent = JSON.stringify(items.slice(0, 3), null, 2);
      resultWrap.classList.remove('hidden');
    } catch { /* preview é opcional */ }
  }

  document.getElementById('download-btn').addEventListener('click', () => convert(false));
  document.getElementById('save-btn').addEventListener('click', () => convert(true));
})();
