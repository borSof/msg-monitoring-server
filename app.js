const express = require('express');
const mongoose = require('mongoose');
const xml2js = require('xml2js');

const app = express();
const PORT = 3000;

// Импортираме модели
const Message = require('./models/Message');
const Rule = require('./models/Rule');

// 1) Глобален лог за всички заявки
app.use((req, res, next) => {
  console.log(`[🔔] ${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// 2) Приемаме raw XML като текст
app.use(express.text({ type: 'application/xml' }));

// 3) XML ➜ JSON парсинг с debug логове
app.use((req, res, next) => {
  if (req.is('application/xml')) {
    console.log('[📥] Raw XML:', req.body);
    xml2js.parseString(req.body, { explicitArray: false }, (err, result) => {
      if (err) {
        console.error('[❌] XML parse failed:', err.message);
        return res.status(400).send('Invalid XML');
      }
      console.log('[✅] Parsed JSON:', result);
      req.body = result;
      next();
    });
  } else {
    next();
  }
});

// Health-check endpoint
app.get('/', (req, res) => {
  res.send('✅ Server is running');
});

// POST /api/messages с интегриран Rule Engine
app.post('/api/messages', async (req, res) => {
  console.log('[▶️] Reached POST /api/messages');
  try {
    const parsed = req.body;
    const raw = JSON.stringify(parsed);

    // 1) Зареждаме потребителските правила
    const rules = await Rule.find().sort({ priority: 1, createdAt: 1 });

    let status = 'Maybe';
    const tags = [];

    // Хелпър за JSON-path
    const getField = (obj, path) =>
      path.split('.').reduce((o, p) => o && o[p] != null ? o[p] : null, obj);

    // 2) Прилагаме всяко правило
    for (const r of rules) {
      const fieldValue = getField(parsed, r.field);
      if (fieldValue == null) continue;

      const str = String(fieldValue);
      let match = false;

      switch (r.operator) {
        case 'contains':
          match = str.includes(r.value);
          break;
        case 'equals':
          match = str === r.value;
          break;
        case 'regex':
          match = new RegExp(r.value).test(str);
          break;
        case 'gt':
          match = Number(str) > Number(r.value);
          break;
        case 'lt':
          match = Number(str) < Number(r.value);
          break;
      }

      if (!match) continue;

      if (r.action === 'Tag') {
        tags.push(r.tag);
        continue;  // добавяме таг и продължаваме
      }

      status = r.action;
      break;  // спираме при първото Allow/Forbidden правило
    }

    // 3) Фалбек при Maybe
    if (status === 'Maybe') {
      const low = raw.toLowerCase();
      if (low.includes('ban')) status = 'Forbidden';
      else if (low.includes('allow') || low.includes('ok')) status = 'Allowed';
    }

    // 4) Съхраняваме съобщението, включително таговете
    const msg = new Message({ rawXml: raw, parsed, status, tags });
    await msg.save();

    console.log('[💾] Message saved:', msg._id, `status=${status}`, tags.length ? `tags=${tags}` : '');
    res.json({ status, id: msg._id, tags });
  } catch (e) {
    console.error('[❌] While saving message:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET всички съобщения
app.get('/api/messages', async (req, res) => {
  try {
    const all = await Message.find().sort({ receivedAt: -1 });
    res.json(all);
  } catch (e) {
    console.error('[❌] Fetching messages:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET само Maybe съобщения
app.get('/api/messages/maybe', async (req, res) => {
  try {
    const m = await Message.find({ status: 'Maybe' }).sort({ receivedAt: -1 });
    res.json(m);
  } catch (e) {
    console.error('[❌] Fetching maybe messages:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// CRUD за правила
app.get('/api/rules', async (req, res) => {
  const rules = await Rule.find().sort({ priority: 1, createdAt: 1 });
  res.json(rules);
});

app.post('/api/rules', async (req, res) => {
  const rule = new Rule(req.body);
  await rule.save();
  res.status(201).json(rule);
});

app.put('/api/rules/:id', async (req, res) => {
  const updated = await Rule.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(updated);
});

app.delete('/api/rules/:id', async (req, res) => {
  await Rule.findByIdAndDelete(req.params.id);
  res.status(204).send();
});

// Стартиране
mongoose.connect('mongodb://localhost:27017/msg-monitoring', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => {
    console.log('[✅] MongoDB connected');
    app.listen(PORT, () => console.log(`[🚀] Server listening on http://localhost:${PORT}`));
  })
  .catch(err => console.error('[❌] MongoDB error:', err));
