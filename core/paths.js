const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const SHARED_DIR = path.join(DATA_DIR, 'shared');
const TMP_DIR = path.join(DATA_DIR, 'tmp');
const CONFIG_DIR = path.join(DATA_DIR, 'config');
const MODULES_DIR = path.join(ROOT, 'modules');
const PUBLIC_DIR = path.join(ROOT, 'public');

for (const dir of [DATA_DIR, SHARED_DIR, TMP_DIR, CONFIG_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

module.exports = { ROOT, DATA_DIR, SHARED_DIR, TMP_DIR, CONFIG_DIR, MODULES_DIR, PUBLIC_DIR };
