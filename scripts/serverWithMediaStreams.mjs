import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import twilio from 'twilio';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
const twilioClient = TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN 
  ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
  : null;

const app = express();
const PORT = 3000;

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server for Media Streams
const wss = new WebSocketServer({ server });

// Store active Media Stream connections
const mediaStreams = new Map();

// Store final transcriptions by call SID
const finalTranscriptions = new Map();

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

// Test endpoint to verify transcription webhook is accessible
app.get('/webhook/transcription/test', (req, res) => {
  res.json({
    message: 'Transcription webhook endpoint is accessible!',
    url: req.url,
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
    
    // Display final transcription if we have it stored
    if (callSid && finalTranscriptions.has(callSid)) {
      const transcription = finalTranscriptions.get(callSid);
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📝 FINAL TRANSCRIPTION FOR CALL ${callSid}:`);
      console.log(`${'='.repeat(60)}`);
      console.log(`"${transcription.text}"`);
      if (transcription.confidence) {
        console.log(`Confidence: ${(transcription.confidence * 100).toFixed(1)}%`);
      }
      console.log(`Timestamp: ${transcription.timestamp}`);
      console.log(`${'='.repeat(60)}\n`);
      
      // Clean up stored transcription
      finalTranscriptions.delete(callSid);
    } else {
      console.log(`\n⚠️  No final transcription stored for call ${callSid}`);
    }
    
    // Try to fetch Real-Time Transcriptions for this call via API
    if (twilioClient && callSid) {
      console.log(`\n🔍 Fetching Real-Time Transcriptions for call ${callSid}...`);
      twilioClient.calls(callSid).transcriptions.list()
        .then(transcriptions => {
          console.log(`  Found ${transcriptions.length} Real-Time Transcription(s):`);
          transcriptions.forEach((t, i) => {
            console.log(`  [${i + 1}] SID: ${t.sid}, Status: ${t.status}, Name: ${t.name || 'N/A'}`);
          });
        })
        .catch(err => {
          console.error(`  ❌ Error fetching Real-Time Transcriptions:`, err.message);
        });
      
      // Also try the old transcriptions API (for post-call transcriptions)
      twilioClient.transcriptions.list({ callSid })
        .then(transcriptions => {
          if (transcriptions.length > 0) {
            console.log(`  Found ${transcriptions.length} post-call transcription(s):`);
            transcriptions.forEach((t, i) => {
              console.log(`  [${i + 1}] Status: ${t.status}, Text: "${t.transcriptionText || 'N/A'}"`);
            });
          }
        })
        .catch(err => {
          // This is expected to fail if no post-call transcriptions exist
        });
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
  
  const transcriptionUrl = `https://${hostWithoutPort}/webhook/transcription`;
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Start>
    <Stream url="${streamUrl}" track="inbound_track" />
    <Transcription statusCallbackUrl="${transcriptionUrl}" partialResults="true" />
  </Start>
  <Say voice="alice">Hello! I'm listening and will transcribe what you say in real time.</Say>
  <Pause length="30"/>
  <Say voice="alice">Thank you for speaking. Check your server logs for transcription events.</Say>
</Response>`;
  
  console.log('\n📋 TwiML being sent (GET):');
  console.log(twiml);
  console.log(`\n📝 Transcription webhook URL: ${transcriptionUrl}\n`);
  
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

  // TwiML with Media Streams + Real-Time Transcription
  // Use <Transcription> noun inside <Start> to get real-time transcriptions via webhook
  // See: https://www.twilio.com/docs/voice/twiml/transcription
  const transcriptionUrl = `https://${hostWithoutPort}/webhook/transcription`;
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Start>
    <Stream url="${streamUrl}" track="inbound_track" />
    <Transcription statusCallbackUrl="${transcriptionUrl}" partialResults="true" />
  </Start>
  <Say voice="alice">Hello! I'm listening and will transcribe what you say in real time.</Say>
  <Pause length="30"/>
  <Say voice="alice">Thank you for speaking. Check your server logs for transcription events.</Say>
</Response>`;

  console.log('\n📋 TwiML being sent:');
  console.log(twiml);
  console.log(`\n📝 Transcription webhook URL: ${transcriptionUrl}\n`);

  res.type('text/xml');
  res.send(twiml);
});

// Webhook endpoint to receive transcription events from Twilio
app.post('/webhook/transcription', (req, res) => {
  // Twilio Real-Time Transcription webhook format:
  // - TranscriptionEvent: "transcription-content"
  // - TranscriptionData: JSON string with {"transcript": "...", "confidence": 0.9}
  // - Final: "true" or "false"
  // - TranscriptionSid: The transcription resource SID
  // - CallSid: The call SID
  
  const transcriptionData = req.body.TranscriptionData;
  const isFinal = req.body.Final === 'true';
  const stability = req.body.Stability;
  const callSid = req.body.CallSid;
  const transcriptionSid = req.body.TranscriptionSid;
  
  let transcript = '';
  let confidence = null;
  
  // Parse TranscriptionData JSON string
  if (transcriptionData) {
    try {
      const parsed = JSON.parse(transcriptionData);
      transcript = parsed.transcript || '';
      confidence = parsed.confidence || null;
    } catch (e) {
      // If parsing fails, try to use it as-is
      transcript = transcriptionData;
    }
  }
  
  if (transcript.trim()) {
    if (isFinal) {
      console.log(`\n✅✅✅ FINAL TRANSCRIPTION: "${transcript}"`);
      if (confidence) console.log(`   Confidence: ${(confidence * 100).toFixed(1)}%`);
      if (callSid) console.log(`   Call SID: ${callSid}`);
      if (transcriptionSid) console.log(`   Transcription SID: ${transcriptionSid}`);
      
      // Store the final transcription for this call
      if (callSid) {
        finalTranscriptions.set(callSid, {
          text: transcript,
          confidence: confidence,
          transcriptionSid: transcriptionSid,
          timestamp: new Date().toISOString()
        });
      }
      
      // Try to fetch the Real-Time Transcription resource via API
      // This might help it show up in the Twilio dashboard
      if (twilioClient && callSid && transcriptionSid) {
        twilioClient.calls(callSid).transcriptions(transcriptionSid)
          .fetch()
          .then(transcription => {
            console.log(`\n📊 Real-Time Transcription Resource:`);
            console.log(`   SID: ${transcription.sid}`);
            console.log(`   Status: ${transcription.status}`);
            console.log(`   Name: ${transcription.name || 'N/A'}`);
            console.log(`   This resource exists in Twilio but may not appear in dashboard`);
            console.log(`   (Real-Time Transcriptions are ephemeral by design)`);
          })
          .catch(err => {
            console.log(`   ⚠️  Could not fetch transcription resource: ${err.message}`);
          });
      }
    } else {
      // Only log interim if stability is high (reduce noise)
      if (stability && parseFloat(stability) >= 0.8) {
        console.log(`\n📝 INTERIM (stable): "${transcript}"`);
      }
    }
  }
  
  res.status(200).send('OK');
});

app.get('/webhook/transcription', (req, res) => {
  console.log('\n📝 ===== TRANSCRIPTION WEBHOOK GET (verification) =====');
  console.log('  Query:', req.query);
  console.log('  Headers:', req.headers);
  res.status(200).send('OK');
});

// WebSocket endpoint for Media Streams
wss.on('connection', (ws, req) => {
  console.log('\n🔌 Media Stream WebSocket connection opened');
  
  // Capture host from WebSocket request for constructing response URLs
  const host = req.headers.host || 'localhost:3000';
  const hostWithoutPort = host.split(':')[0];
  
  let callSid = null;
  let audioChunkCount = 0;

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      // Log events (but suppress media spam)
      if (message.event !== 'media') {
        console.log(`  📨 Event: ${message.event}`);
        console.log('  📋 Full message:', JSON.stringify(message, null, 2));
      }
      
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
        
        // Also try to manually create a Real-Time Transcription via API as backup
        // (in case TwiML transcription didn't start)
        if (twilioClient && callSid) {
          const transcriptionUrl = `https://${hostWithoutPort}/webhook/transcription`;
          console.log(`\n  🔧 Attempting to create Real-Time Transcription via API...`);
          console.log(`     Webhook URL: ${transcriptionUrl}`);
          
          twilioClient.calls(callSid).transcriptions.create({
            statusCallbackUrl: transcriptionUrl,
            partialResults: true
          })
          .then(transcription => {
            console.log(`  ✅ Real-Time Transcription created via API!`);
            console.log(`     Transcription SID: ${transcription.sid}`);
            console.log(`     Status: ${transcription.status}`);
          })
          .catch(err => {
            console.error(`  ⚠️  Could not create transcription via API:`, err.message);
            console.error(`     This is OK if TwiML transcription is working`);
          });
        }
      }
      
      // Handle transcription events - log them when they arrive
      if (message.event === 'transcription' || message.transcription) {
        const transcript = message.transcription || message;
        const text = transcript.text || '';
        const isFinal = transcript.status === 'completed' || transcript.is_final;
        
        console.log(`  📝 TRANSCRIPTION RECEIVED:`);
        console.log(`     Text: "${text}"`);
        console.log(`     Status: ${transcript.status || 'unknown'}`);
        console.log(`     Final: ${isFinal}`);
      }
      
      if (message.event === 'media') {
        audioChunkCount++;
        
        // Log less frequently (every 100 chunks = ~5 seconds)
        if (audioChunkCount === 1 || audioChunkCount % 100 === 0) {
          console.log(`  🎤 Received audio chunk #${audioChunkCount}`);
        }
      }
      
      if (message.event === 'stop') {
        console.log('  🛑 Media Stream stopped');
        if (callSid) {
          mediaStreams.delete(callSid);
          
          // Display final transcription if we have it stored
          if (finalTranscriptions.has(callSid)) {
            const transcription = finalTranscriptions.get(callSid);
            console.log(`\n${'='.repeat(60)}`);
            console.log(`📝 FINAL TRANSCRIPTION FOR CALL ${callSid}:`);
            console.log(`${'='.repeat(60)}`);
            console.log(`"${transcription.text}"`);
            if (transcription.confidence) {
              console.log(`Confidence: ${(transcription.confidence * 100).toFixed(1)}%`);
            }
            console.log(`Timestamp: ${transcription.timestamp}`);
            console.log(`${'='.repeat(60)}\n`);
            
            // Clean up stored transcription
            finalTranscriptions.delete(callSid);
          }
        }
      }
    } catch (error) {
      console.error('  ❌ Error parsing Media Stream message:', error.message);
      console.error('  Raw data:', data.toString().substring(0, 200));
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

