const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { body, validationResult } = require('express-validator');
const xml2js = require('xml2js');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors({ origin: 'http://localhost:3001' }));
app.use(express.json());
app.use(express.text({ type: 'application/xml' }));

// Импортираме модели
const Message = require('./models/Message');
const Rule = require('./models/Rule');

// Logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// XML парсинг
app.use((req, res, next) => {
  if (req.is('application/xml')) {
    console.log('Raw XML:', req.body);
    xml2js.parseString(req.body, { explicitArray: false }, (err, result) => {
      if (err) {
        console.error('XML parse failed:', err.message);
        return res.status(400).send('Invalid XML');
      }
      req.body = result;
      next();
    });
  } else {
    next();
  }
});

// Health-check
app.get('/', (req, res) => res.send('Server is running'));

// POST /api/messages
app.post('/api/messages', async (req, res) => {
  try {
    const parsed = req.body;
    const raw = JSON.stringify(parsed);
    const rules = await Rule.find().sort({ priority: 1, createdAt: 1 });
    let status = 'Maybe';
    const tags = [];
    const getField = (obj, path) => path.split('.').reduce((o, p) => o && o[p] != null ? o[p] : null, obj);

    for (const r of rules) {
      const fieldValue = getField(parsed, r.field);
      if (fieldValue == null) continue;
      const str = String(fieldValue);
      let match = false;
      switch (r.operator) {
        case 'contains': match = str.includes(r.value); break;
        case 'equals': match = str === r.value; break;
        case 'regex': match = new RegExp(r.value).test(str); break;
        case 'gt': match = Number(str) > Number(r.value); break;
        case 'lt': match = Number(str) < Number(r.value); break;
      }
      if (!match) continue;
      if (r.action === 'Tag') {
        tags.push(r.tag);
        continue;
      }
      status = r.action;
      break;
    }
    if (status === 'Maybe') {
      const low = raw.toLowerCase();
      if (low.includes('ban')) status = 'Forbidden';
      else if (low.includes('allow') || low.includes('ok')) status = 'Allowed';
    }
    const msg = new Message({ rawXml: raw, parsed, status, tags });
    await msg.save();
    res.json({ status, id: msg._id, tags });
  } catch (e) {
    console.error('Error saving message:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET messages
app.get('/api/messages', async (req, res) => {
  try {
    const all = await Message.find().sort({ receivedAt: -1 });
    res.json(all);
  } catch (e) {
    console.error('Error fetching messages:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/messages/maybe', async (req, res) => {
  try {
    const m = await Message.find({ status: 'Maybe' }).sort({ receivedAt: -1 });
    res.json(m);
  } catch (e) {
    console.error('Error fetching maybe messages:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// CRUD rules with validation
app.get('/api/rules', async (req, res) => {
  const rules = await Rule.find().sort({ priority: 1, createdAt: 1 });
  res.json(rules);
});

app.post('/api/rules',
  [
    body('name').isString().notEmpty(),
    body('field').isString().notEmpty(),
    body('operator').isIn(['contains','equals','regex','gt','lt']),
    body('value').isString().notEmpty(),
    body('action').isIn(['Allowed','Forbidden','Tag']),
    body('priority').isInt({ min: 1 })
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const rule = new Rule(req.body);
    await rule.save();
    res.status(201).json(rule);
  }
);

app.put('/api/rules/:id', async (req, res) => {
  const updated = await Rule.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(updated);
});

app.delete('/api/rules/:id', async (req, res) => {
  await Rule.findByIdAndDelete(req.params.id);
  res.status(204).send();
});

// Start server
mongoose.connect('mongodb://localhost:27017/msg-monitoring', {
  user: 'admin',
  pass: '1234',
  authSource: 'admin'
})
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
  })
  .catch(err => console.error('MongoDB error:', err));
