// Utilidades para navegação em objetos via dot notation
// (ex.: "body.settlement_tax.amount") usadas por vários módulos.

/** Obtém o valor em `path` dentro de `obj`; retorna undefined se o caminho não existir. */
function get(obj, path) {
  if (obj === null || obj === undefined) return undefined;
  // chave plana com ponto no nome (ex.: coluna CSV "merchant.name") tem prioridade
  if (typeof obj === 'object' && !Array.isArray(obj) && Object.prototype.hasOwnProperty.call(obj, path)) {
    return obj[path];
  }
  const parts = String(path).split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current) && /^\d+$/.test(part)) {
      current = current[Number(part)];
    } else if (typeof current === 'object') {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return current;
}

/** Define `value` em `path` dentro de `obj`, criando objetos intermediários quando necessário. */
function set(obj, path, value) {
  const parts = String(path).split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const nextIsIndex = /^\d+$/.test(parts[i + 1]);
    if (current[part] === null || current[part] === undefined || typeof current[part] !== 'object') {
      current[part] = nextIsIndex ? [] : {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
  return obj;
}

/** Achata um objeto aninhado em um mapa de caminhos dot notation → valor. */
function flatten(obj, prefix = '', result = {}) {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    if (prefix) result[prefix] = obj;
    return result;
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0 && prefix) result[prefix] = [];
    obj.forEach((item, idx) => flatten(item, prefix ? `${prefix}.${idx}` : String(idx), result));
    return result;
  }
  const keys = Object.keys(obj);
  if (keys.length === 0 && prefix) result[prefix] = {};
  for (const key of keys) {
    flatten(obj[key], prefix ? `${prefix}.${key}` : key, result);
  }
  return result;
}

/** Reconstrói um objeto aninhado a partir de um mapa dot notation → valor. */
function unflatten(map) {
  const result = {};
  for (const [path, value] of Object.entries(map)) {
    set(result, path, value);
  }
  return result;
}

/**
 * Coleta os caminhos dot notation presentes em um objeto (sem expandir índices
 * de arrays além do primeiro item, para gerar uma lista de campos enxuta).
 */
function collectPaths(obj, prefix = '', paths = new Set(), depth = 0) {
  if (depth > 12 || obj === null || obj === undefined || typeof obj !== 'object') {
    if (prefix) paths.add(prefix);
    return paths;
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      if (prefix) paths.add(prefix);
    } else {
      collectPaths(obj[0], prefix, paths, depth + 1);
    }
    return paths;
  }
  const keys = Object.keys(obj);
  if (keys.length === 0 && prefix) paths.add(prefix);
  for (const key of keys) {
    collectPaths(obj[key], prefix ? `${prefix}.${key}` : key, paths, depth + 1);
  }
  return paths;
}

module.exports = { get, set, flatten, unflatten, collectPaths };
