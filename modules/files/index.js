const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharedFiles = require('../../core/shared-files');

const router = express.Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dest = req.query.dest === 'tmp' ? sharedFiles.TMP_DIR : sharedFiles.SHARED_DIR;
      cb(null, dest);
    },
    filename: (req, file, cb) => {
      // corrige nomes com acentos enviados como latin1 e evita sobrescrever
      let name = Buffer.from(file.originalname, 'latin1').toString('utf8');
      name = path.basename(name);
      const dest = req.query.dest === 'tmp' ? 'tmp' : 'shared';
      if (sharedFiles.exists(dest, name)) {
        const ext = path.extname(name);
        const base = path.basename(name, ext);
        let n = 1;
        while (sharedFiles.exists(dest, `${base}(${n})${ext}`)) n++;
        name = `${base}(${n})${ext}`;
      }
      cb(null, name);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024 },
});

router.get('/list', (req, res) => {
  res.json(sharedFiles.list('shared'));
});

router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  res.json({ name: req.file.filename, size: req.file.size });
});

router.post('/save', (req, res) => {
  const { name, content } = req.body || {};
  if (!name || content === undefined) {
    return res.status(400).json({ error: 'Informe name e content.' });
  }
  const saved = sharedFiles.writeText('shared', name, String(content));
  res.json({ name: saved });
});

router.get('/download/:name', (req, res) => {
  const full = sharedFiles.resolve('shared', req.params.name);
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'Arquivo não encontrado.' });
  res.download(full);
});

router.get('/preview/:name', (req, res) => {
  const full = sharedFiles.resolve('shared', req.params.name);
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'Arquivo não encontrado.' });
  const stat = fs.statSync(full);
  const max = 20 * 1024;
  const fd = fs.openSync(full, 'r');
  const buffer = Buffer.alloc(Math.min(stat.size, max));
  fs.readSync(fd, buffer, 0, buffer.length, 0);
  fs.closeSync(fd);
  res.json({ content: buffer.toString('utf8'), truncated: stat.size > max, size: stat.size });
});

router.delete('/:name', (req, res) => {
  if (!sharedFiles.exists('shared', req.params.name)) {
    return res.status(404).json({ error: 'Arquivo não encontrado.' });
  }
  sharedFiles.remove('shared', req.params.name);
  res.json({ ok: true });
});

module.exports = {
  meta: {
    title: 'Arquivos',
    description: 'Pasta compartilhada: envie arquivos e disponibilize para todos os módulos.',
    order: 1,
    icon: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`,
  },
  router,
};
