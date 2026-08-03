// Parser e serializador de CSV sem dependências externas.
// Suporta aspas duplas (RFC 4180), quebras de linha dentro de campos,
// BOM UTF-8 e detecção automática de delimitador (, ou ;).

function detectDelimiter(text) {
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
  let commas = 0;
  let semicolons = 0;
  let tabs = 0;
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes) {
      if (ch === ',') commas++;
      else if (ch === ';') semicolons++;
      else if (ch === '\t') tabs++;
    }
  }
  if (tabs > commas && tabs > semicolons) return '\t';
  if (semicolons > commas) return ';';
  return ',';
}

/**
 * @param {string} text conteúdo do CSV
 * @param {{delimiter?: string, hasHeader?: boolean}} [options]
 * @returns {{headers: string[], rows: string[][], delimiter: string}}
 */
function parse(text, options = {}) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // remove BOM
  const delimiter = options.delimiter || detectDelimiter(text);
  const hasHeader = options.hasHeader !== false;

  const records = [];
  let field = '';
  let record = [];
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else if (ch === '"') {
      inQuotes = true;
      i++;
    } else if (ch === delimiter) {
      record.push(field);
      field = '';
      i++;
    } else if (ch === '\r') {
      i++;
    } else if (ch === '\n') {
      record.push(field);
      field = '';
      records.push(record);
      record = [];
      i++;
    } else {
      field += ch;
      i++;
    }
  }
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  // descarta linhas totalmente vazias no final
  while (records.length && records[records.length - 1].every((f) => f === '')) {
    records.pop();
  }

  let headers = [];
  let rows = records;
  if (hasHeader && records.length > 0) {
    headers = records[0].map((h, idx) => (h.trim() === '' ? `coluna_${idx + 1}` : h.trim()));
    rows = records.slice(1);
  } else if (records.length > 0) {
    headers = records[0].map((_, idx) => `coluna_${idx + 1}`);
  }
  return { headers, rows, delimiter };
}

function escapeField(value, delimiter) {
  const str = value === null || value === undefined ? '' : String(value);
  if (str.includes('"') || str.includes(delimiter) || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * @param {string[]} headers
 * @param {Array<string[]|Object>} rows arrays posicionais ou objetos indexados pelos headers
 * @param {{delimiter?: string}} [options]
 */
function serialize(headers, rows, options = {}) {
  const delimiter = options.delimiter || ',';
  const lines = [headers.map((h) => escapeField(h, delimiter)).join(delimiter)];
  for (const row of rows) {
    const values = Array.isArray(row) ? row : headers.map((h) => row[h]);
    lines.push(values.map((v) => escapeField(v, delimiter)).join(delimiter));
  }
  return lines.join('\r\n');
}

/** Converte linhas posicionais em objetos indexados pelos headers. */
function toObjects(headers, rows) {
  return rows.map((row) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] !== undefined ? row[idx] : '';
    });
    return obj;
  });
}

module.exports = { parse, serialize, toObjects, detectDelimiter };
