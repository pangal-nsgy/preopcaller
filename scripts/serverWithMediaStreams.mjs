import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server for Media Streams
const wss = new WebSocketServer({ server });

// Store active Media Stream connections
const mediaStreams = new Map();

// Middleware to parse URL-encoded bodies (Twilio sends form data)
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.json({
    message: 'Server with Media Streams support',
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
  
  // Clean up Media Stream if call ends
  if (req.body.CallStatus === 'completed' || req.body.CallStatus === 'failed') {
    const callSid = req.body.CallSid;
    if (mediaStreams.has(callSid)) {
      console.log(`  Closing Media Stream for call ${callSid}`);
      mediaStreams.delete(callSid);
    }
  }
  
  res.status(200).send('OK');
});

// Twilio webhook endpoint - provides TwiML instructions for the call
// Handle both GET (verification) and POST (actual call)
app.get('/webhook/voice', (req, res) => {
  console.log('\n📞 Twilio Voice Webhook GET (verification/redirect):');
  console.log('  Query params:', req.query);
  // Return TwiML even for GET (Twilio might redirect)
  const host = req.get('host');
  const hostWithoutPort = host.split(':')[0];
  const streamUrl = `wss://${hostWithoutPort}/stream`;
  const callSid = req.query.CallSid || 'unknown';
  
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Start>
    <Stream url="${streamUrl}" />
  </Start>
  <Say voice="alice">Hello! Media Streams are now active. I can hear what you say in real time.</Say>
  <Pause length="30"/>
  <Say voice="alice">You had 30 seconds to speak. I received your audio chunks through the media stream.</Say>
  <Pause length="2"/>
  <Say voice="alice">Call ending now. Check your server logs to see the audio chunks that were received.</Say>
</Response>`;
  
  res.type('text/xml');
  res.send(twiml);
});

app.post('/webhook/voice', (req, res) => {
  const callSid = req.body.CallSid;
  const host = req.get('host');
  // Remove port if present (ngrok provides HTTPS without port)
  const hostWithoutPort = host.split(':')[0];
  const streamUrl = `wss://${hostWithoutPort}/stream`; // WebSocket URL for Media Streams

  console.log('\n📞 Twilio Voice Webhook POST (TwiML requested):');
  console.log('  Call SID:', callSid);
  console.log('  From:', req.body.From);
  console.log('  To:', req.body.To);
  console.log('  Media Stream URL:', streamUrl);
  console.log('');

  // TwiML with Media Streams enabled
  // Keep the call active so we can receive audio chunks
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Start>
    <Stream url="${streamUrl}" />
  </Start>
  <Say voice="alice">Hello! Media Streams are now active. I can hear what you say in real time.</Say>
  <Pause length="30"/>
  <Say voice="alice">You had 30 seconds to speak. I received your audio chunks through the media stream.</Say>
  <Pause length="2"/>
  <Say voice="alice">Call ending now. Check your server logs to see the audio chunks that were received.</Say>
</Response>`;

  res.type('text/xml');
  res.send(twiml);
});

// WebSocket endpoint for Media Streams
wss.on('connection', (ws, req) => {
  console.log('\n🔌 Media Stream WebSocket connection opened');
  
  let callSid = null;
  let audioChunkCount = 0;

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.event === 'connected') {
        console.log('  ✅ Media Stream connected');
        console.log('  Protocol:', message.protocol);
        console.log('  Version:', message.version);
      }
      
      if (message.event === 'start') {
        callSid = message.start.callSid;
        mediaStreams.set(callSid, ws);
        console.log(`  📞 Media Stream started for call: ${callSid}`);
        console.log('  Account SID:', message.start.accountSid);
        console.log('  From:', message.start.from);
        console.log('  To:', message.start.to);
        console.log('  Direction:', message.start.track);
      }
      
      if (message.event === 'media') {
        audioChunkCount++;
        
        // Log first chunk and then every 20 chunks (about 1 second at 50ms intervals)
        if (audioChunkCount === 1 || audioChunkCount % 20 === 0) {
          console.log(`  🎤 Audio chunk #${audioChunkCount} received (${message.media.timestamp}ms) - ${message.media.payload.length} bytes`);
          console.log(`     This means you're speaking! 🗣️`);
        }
        
        // TODO: Send audio to ElevenLabs STT
        // For now, we're just receiving and logging
      }
      
      if (message.event === 'stop') {
        console.log('  🛑 Media Stream stopped');
        if (callSid) {
          mediaStreams.delete(callSid);
        }
      }
    } catch (error) {
      console.error('  ❌ Error parsing Media Stream message:', error.message);
    }
  });

  ws.on('error', (error) => {
    console.error('  ❌ Media Stream WebSocket error:', error.message);
  });

  ws.on('close', () => {
    console.log('  🔌 Media Stream WebSocket connection closed');
    if (callSid) {
      mediaStreams.delete(callSid);
    }
  });
});

server.listen(PORT, () => {
  console.log(`✅ Server with Media Streams running on http://localhost:${PORT}`);
  console.log(`   Test: http://localhost:${PORT}/test`);
  console.log(`   Status webhook: http://localhost:${PORT}/webhook/status`);
  console.log(`   Voice webhook: http://localhost:${PORT}/webhook/voice`);
  console.log(`   Media Stream: wss://localhost:${PORT}/stream\n`);
});

