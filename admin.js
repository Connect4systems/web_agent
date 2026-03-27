
const express = require('express');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const path = require('path');
const app = express();

const PROMPT_PATH = path.join(__dirname, 'prompts', 'agent-instructions.txt');
const KNOWLEDGE_DIR = path.join(__dirname, 'knowledge');

// Minimal HTTP Basic Auth middleware
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'changeme';
app.use('/admin', (req, res, next) => {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Admin Area"');
    return res.status(401).send('Authentication required.');
  }
  const [user, pass] = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
  if (user === ADMIN_USER && pass === ADMIN_PASS) return next();
  res.set('WWW-Authenticate', 'Basic realm="Admin Area"');
  return res.status(401).send('Invalid credentials.');
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());

// List files
app.get('/admin', (req, res) => {
  const files = fs.readdirSync(KNOWLEDGE_DIR).filter(f => f.endsWith('.txt'));
  res.render('admin', { files, promptFile: 'agent-instructions.txt' });
});

// Edit file
app.get('/admin/edit/:file', (req, res) => {
  const file = req.params.file;
  const filePath = file === 'agent-instructions.txt' ? PROMPT_PATH : path.join(KNOWLEDGE_DIR, file);
  const content = fs.readFileSync(filePath, 'utf8');
  res.render('edit', { file, content });
});

app.post('/admin/edit/:file', (req, res) => {
  const file = req.params.file;
  const filePath = file === 'agent-instructions.txt' ? PROMPT_PATH : path.join(KNOWLEDGE_DIR, file);
  fs.writeFileSync(filePath, req.body.content, 'utf8');
  res.redirect('/admin');
});

// Add new text block
app.post('/admin/add', (req, res) => {
  const name = req.body.name.replace(/[^a-zA-Z0-9_\-]/g, '') + '.txt';
  const filePath = path.join(KNOWLEDGE_DIR, name);
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '', 'utf8');
  res.redirect(`/admin/edit/${name}`);
});

// Delete text block
app.post('/admin/delete/:file', (req, res) => {
  const file = req.params.file;
  if (file !== 'agent-instructions.txt') {
    fs.unlinkSync(path.join(KNOWLEDGE_DIR, file));
  }
  res.redirect('/admin');
});

app.listen(4000, () => console.log('Admin UI running on http://localhost:4000/admin'));
