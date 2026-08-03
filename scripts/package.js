// Compacta o projeto para distribuição, incluindo somente o necessário:
// código-fonte + dependências de produção (sem devDependencies, sem data/, sem caches).
//
// Uso: npm run package
// Saída: dist/support-analytics-<versao>.zip

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const STAGING = path.join(DIST, 'staging');

const INCLUDE = ['server.js', 'package.json', 'package-lock.json', 'README.md', 'core', 'modules', 'public'];

function log(msg) {
  console.log(`[package] ${msg}`);
}

function folderSize(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? folderSize(full) : fs.statSync(full).size;
  }
  return total;
}

function mb(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

// 1. staging limpo
log('preparando pasta de staging…');
fs.rmSync(STAGING, { recursive: true, force: true });
fs.mkdirSync(STAGING, { recursive: true });

// 2. copia apenas os arquivos do projeto (sem data/, node_modules/, dist/)
for (const item of INCLUDE) {
  const src = path.join(ROOT, item);
  if (!fs.existsSync(src)) continue;
  fs.cpSync(src, path.join(STAGING, item), { recursive: true });
  log(`copiado: ${item}`);
}

// 3. instala somente dependências de produção
log('instalando dependências de produção (npm install --omit=dev)…');
execSync('npm install --omit=dev --no-audit --no-fund --no-bin-links', {
  cwd: STAGING,
  stdio: 'inherit',
  shell: true,
});

log(`tamanho do staging: ${mb(folderSize(STAGING))}`);

// 4. gera o zip (tar do Windows 10+ / bsdtar entende .zip com -a)
const version = require(path.join(ROOT, 'package.json')).version;
const zipName = `support-analytics-${version}.zip`;
const zipPath = path.join(DIST, zipName);
fs.rmSync(zipPath, { force: true });

log(`gerando ${zipName}…`);
execSync(`tar -a -c -f "${zipPath}" -C "${STAGING}" .`, { stdio: 'inherit', shell: true });

// 5. limpa o staging
fs.rmSync(STAGING, { recursive: true, force: true });

log(`pronto: dist/${zipName} (${mb(fs.statSync(zipPath).size)})`);
log('para usar: extraia o zip e rode "node server.js" (Node 18+).');
