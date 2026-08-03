// Armazenamento simples em arquivos JSON (data/config/<nome>.json).
// Usado para persistir cadastros sem depender de banco de dados.

const fs = require('fs');
const path = require('path');
const { CONFIG_DIR } = require('./paths');

function fileFor(name) {
  if (!/^[a-z0-9-_]+$/i.test(name)) throw new Error(`Nome de storage inválido: ${name}`);
  return path.join(CONFIG_DIR, `${name}.json`);
}

/** Lê o conteúdo do storage; retorna `fallback` se o arquivo não existir ou for inválido. */
function read(name, fallback = []) {
  try {
    const raw = fs.readFileSync(fileFor(name), 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Grava o conteúdo (escrita atômica: tmp + rename). */
function write(name, data) {
  const target = fileFor(name);
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, target);
}

let idCounter = 0;
function newId() {
  idCounter = (idCounter + 1) % 1000;
  return Date.now().toString(36) + '-' + idCounter.toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

module.exports = { read, write, newId };
