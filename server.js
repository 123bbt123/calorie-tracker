const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 提供 schema.sql 文件
app.get('/supabase/schema.sql', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.sendFile(path.join(__dirname, 'supabase', 'schema.sql'));
});

// AI API 代理（避免 CORS 问题）
app.post('/api/ai-proxy', async (req, res) => {
  try {
    const { targetUrl, apiKey, body } = req.body;
    if (!targetUrl || !apiKey) {
      return res.status(400).json({ error: { message: '缺少 targetUrl 或 apiKey' } });
    }
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });
    const data = await response.text();
    res.status(response.status).set('Content-Type', 'application/json').send(data);
  } catch (error) {
    console.error('AI proxy error:', error.message);
    res.status(500).json({ error: { message: error.message } });
  }
});

app.listen(PORT, () => {
  console.log(`\n  日食迹 · 热量管理工作台`);
  console.log(`  运行于 http://localhost:${PORT}\n`);
});
