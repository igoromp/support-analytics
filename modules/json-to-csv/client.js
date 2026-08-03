(() => {
  const { api, toast, el, filePicker, fieldMapper, download } = window.UI;

  const previewBtn = document.getElementById('preview-btn');
  const arrayPathField = document.getElementById('array-path-field');
  const arrayPathSelect = document.getElementById('array-path');
  const previewCard = document.getElementById('preview-card');
  const previewInfo = document.getElementById('preview-info');
  const previewJson = document.getElementById('preview-json');
  const fieldsCard = document.getElementById('fields-card');
  const outputCard = document.getElementById('output-card');
  const outFilename = document.getElementById('out-filename');
  const extraField = document.getElementById('extra-field');

  let mapper = null;
  let currentFile = null;
  let currentFields = [];

  const picker = filePicker(document.getElementById('picker'), {
    accept: ['json'],
    onChange: (file) => {
      previewBtn.disabled = !file;
      arrayPathField.classList.add('hidden');
      arrayPathSelect.innerHTML = '';
    },
  });

  previewBtn.addEventListener('click', () => loadPreview());

  async function loadPreview() {
    const file = picker.getFile();
    if (!file) return;
    previewBtn.disabled = true;
    try {
      const arrayPath = arrayPathSelect.value || undefined;
      const data = await api('/api/json-to-csv/preview', { method: 'POST', body: { ...file, arrayPath } });

      if (data.needsPath) {
        arrayPathField.classList.remove('hidden');
        arrayPathSelect.innerHTML = '';
        arrayPathSelect.append(
          el('option', { value: '', text: '— escolha onde está o array de itens —' }),
          ...data.arraySuggestions.map((p) => el('option', { value: p, text: p }))
        );
        toast('O JSON raiz não é um array. Escolha o caminho do array e carregue o preview de novo.', 'info', 6000);
        return;
      }

      currentFile = file;
      currentFields = data.fields;
      previewInfo.textContent = `${data.total} itens · ${data.fields.length} campos detectados`;
      previewJson.textContent = JSON.stringify(data.sample, null, 2);
      mapper = fieldMapper(document.getElementById('field-mapper'), { fields: data.fields });
      outFilename.value = file.name.replace(/\.json$/i, '') + '.csv';
      [previewCard, fieldsCard, outputCard].forEach((c) => c.classList.remove('hidden'));
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      previewBtn.disabled = false;
    }
  }

  document.getElementById('add-field-btn').addEventListener('click', () => {
    const value = extraField.value.trim();
    if (!value) return;
    if (currentFields.includes(value)) {
      toast('Esse campo já está na lista.', 'error');
      return;
    }
    currentFields = [...currentFields, value];
    const previous = mapper ? mapper.getSelection() : [];
    mapper = fieldMapper(document.getElementById('field-mapper'), { fields: currentFields });
    extraField.value = '';
    void previous; // seleção anterior é reiniciada; todos vêm marcados por padrão
  });

  async function convert(save) {
    if (!currentFile || !mapper) return;
    const fields = mapper.getSelection();
    if (!fields.length) {
      toast('Selecione ao menos um campo.', 'error');
      return;
    }
    try {
      const result = await api('/api/json-to-csv/convert', {
        method: 'POST',
        body: {
          ...currentFile,
          arrayPath: arrayPathSelect.value || undefined,
          fields,
          delimiter: document.getElementById('delimiter').value,
          save,
          filename: outFilename.value,
        },
      });
      if (save) {
        toast(`Salvo na pasta compartilhada como "${result.savedAs}" (${result.total} linhas).`, 'ok');
        picker.reloadShared();
      } else {
        download(outFilename.value || 'resultado.csv', result.content, 'text/csv');
        toast(`CSV gerado com ${result.total} linhas.`, 'ok');
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  document.getElementById('download-btn').addEventListener('click', () => convert(false));
  document.getElementById('save-btn').addEventListener('click', () => convert(true));
})();
