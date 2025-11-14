import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const envPath = path.resolve(projectRoot, '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Server is running!',
    timestamp: new Date().toISOString(),
  });
});

// Test endpoint to verify ngrok is working
app.get('/test', (req, res) => {
  res.json({
    message: 'Ngrok tunnel is working!',
    receivedAt: new Date().toISOString(),
    yourIp: req.ip,
    userAgent: req.get('user-agent'),
  });
});

// Simple webhook endpoint (for future Twilio integration)
app.post('/webhook', (req, res) => {
  console.log('📞 Webhook received:', {
    method: req.method,
    body: req.body,
    timestamp: new Date().toISOString(),
  });

  res.json({
    status: 'received',
    message: 'Webhook data received successfully',
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`\n✅ Server running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/`);
  console.log(`   Test endpoint: http://localhost:${PORT}/test`);
  console.log(`   Webhook endpoint: http://localhost:${PORT}/webhook\n`);
});

