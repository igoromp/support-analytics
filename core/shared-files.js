// Acesso à pasta compartilhada (data/shared) e à pasta temporária (data/tmp).
// Todos os módulos leem e gravam arquivos por aqui, nunca acessando o
// filesystem diretamente — isso centraliza a validação de nomes.

const fs = require('fs');
const path = require('path');
const { SHARED_DIR, TMP_DIR } = require('./paths');

function baseDir(source) {
  if (source === 'shared') return SHARED_DIR;
  if (source === 'tmp') return TMP_DIR;
  throw new Error(`Origem de arquivo inválida: ${source}`);
}

/** Valida o nome e resolve o caminho absoluto, impedindo path traversal. */
function resolve(source, name) {
  const clean = path.basename(String(name));
  if (!clean || clean !== name || clean.startsWith('.')) {
    throw new Error(`Nome de arquivo inválido: ${name}`);
  }
  return path.join(baseDir(source), clean);
}

function list(source = 'shared') {
  const dir = baseDir(source);
  return fs
    .readdirSync(dir)
    .filter((f) => !f.startsWith('.'))
    .map((f) => {
      const stat = fs.statSync(path.join(dir, f));
      return {
        name: f,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        ext: path.extname(f).replace('.', '').toLowerCase(),
      };
    })
    .filter((f) => fs.statSync(path.join(dir, f.name)).isFile())
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

function readText(source, name) {
  return fs.readFileSync(resolve(source, name), 'utf8');
}

/** Grava conteúdo; se já existir um arquivo com o mesmo nome, acrescenta sufixo numérico. */
function writeText(source, name, content) {
  let target = resolve(source, name);
  if (fs.existsSync(target)) {
    const ext = path.extname(name);
    const base = path.basename(name, ext);
    let n = 1;
    while (fs.existsSync(target)) {
      target = path.join(baseDir(source), `${base}(${n})${ext}`);
      n++;
    }
  }
  fs.writeFileSync(target, content, 'utf8');
  return path.basename(target);
}

function remove(source, name) {
  fs.unlinkSync(resolve(source, name));
}

function exists(source, name) {
  try {
    return fs.existsSync(resolve(source, name));
  } catch {
    return false;
  }
}

/** Remove arquivos temporários com mais de 24h. */
function cleanTmp() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const f of fs.readdirSync(TMP_DIR)) {
    const full = path.join(TMP_DIR, f);
    try {
      if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
    } catch {
      /* arquivo pode ter sido removido em paralelo */
    }
  }
}

module.exports = { list, readText, writeText, remove, exists, resolve, cleanTmp, SHARED_DIR, TMP_DIR };
