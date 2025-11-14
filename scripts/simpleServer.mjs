import express from 'express';

const app = express();
const PORT = 3000;

app.get('/', (req, res) => {
  res.json({
    message: 'Hello! This is the simple test server.',
    timestamp: new Date().toISOString(),
  });
});

app.get('/test', (req, res) => {
  res.json({
    message: 'Ngrok is working!',
    publicUrl: req.get('host'),
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`✅ Simple server running on http://localhost:${PORT}`);
  console.log(`   Test: http://localhost:${PORT}/test\n`);
});

