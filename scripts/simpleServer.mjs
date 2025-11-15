import express from 'express';

const app = express();
const PORT = 3000;

// Middleware to parse URL-encoded bodies (Twilio sends form data)
app.use(express.urlencoded({ extended: true }));

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

// Twilio webhook endpoint - receives call status updates
app.post('/webhook/status', (req, res) => {
  console.log('\n📞 Twilio Status Callback:');
  console.log('  Call SID:', req.body.CallSid);
  console.log('  Status:', req.body.CallStatus);
  console.log('  From:', req.body.From);
  console.log('  To:', req.body.To);
  console.log('  Direction:', req.body.Direction);
  console.log('  Timestamp:', new Date().toISOString());
  console.log('');
  
  // Twilio expects a response (200 OK is fine)
  res.status(200).send('OK');
});

// Twilio webhook endpoint - provides TwiML instructions for the call
app.post('/webhook/voice', (req, res) => {
  console.log('\n📞 Twilio Voice Webhook (TwiML requested):');
  console.log('  Call SID:', req.body.CallSid);
  console.log('  From:', req.body.From);
  console.log('  To:', req.body.To);
  console.log('');

  // Send TwiML response (simple greeting for now)
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hello! This is a test call from the pre op caller. Your webhook connection is working correctly.</Say>
  <Pause length="2"/>
  <Say voice="alice">Goodbye!</Say>
</Response>`;

  res.type('text/xml');
  res.send(twiml);
});

app.listen(PORT, () => {
  console.log(`✅ Simple server running on http://localhost:${PORT}`);
  console.log(`   Test: http://localhost:${PORT}/test`);
  console.log(`   Status webhook: http://localhost:${PORT}/webhook/status`);
  console.log(`   Voice webhook: http://localhost:${PORT}/webhook/voice\n`);
});

