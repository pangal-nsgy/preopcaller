import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { textToSpeech } from './elevenlabsClient.mjs';
import { AudioBuffer } from './whisperSTT.mjs';

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
  // Request PCM format instead of mu-law for simpler processing
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Start>
    <Stream url="${streamUrl}" track="inbound_track" />
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
        
        // Initialize Whisper audio buffer for STT with smart buffering
        const audioBuffer = new AudioBuffer(
          // onTranscript callback - when Whisper converts speech to text
          async (text, isFinal) => {
            console.log(`  📝 Transcript: "${text}"`);
            
            // TODO: Send to LLM for response generation
            // For now, just echo back what was said
            if (isFinal && text.trim()) {
              console.log(`  🤖 Generating response for: "${text}"`);
              // TODO: Call LLM here
              // const llmResponse = await callLLM(text);
              
              // For testing: just echo back
              const responseText = `You said: ${text}`;
              
              // Convert response text to speech using ElevenLabs TTS
              try {
                console.log(`  🎙️  Converting to speech: "${responseText}"`);
                const audioData = await textToSpeech(responseText);
                
                // Send audio back to Twilio Media Stream
                // Note: Need to convert MP3 to mu-law - for now just log
                console.log(`  ✅ Generated TTS audio: ${audioData.byteLength} bytes`);
                // TODO: Convert MP3 to mu-law and send via WebSocket
                // For now, we'll add this conversion next
              } catch (error) {
                console.error(`  ❌ TTS error:`, error.message);
              }
            }
          },
          {
            minBufferDurationMs: 5000, // Wait for at least 5 seconds of audio
            maxBufferDurationMs: 15000, // Max 15 seconds before forcing transcription
            pauseDurationMs: 1500, // Wait 1.5s pause before transcribing (end of sentence)
            energyThreshold: 1000, // Minimum energy to consider as speech
          }
        );
        
        // Store audio buffer with the call
        mediaStreams.set(`audioBuffer_${callSid}`, audioBuffer);
        
        // Periodic transcription check (check every 500ms for better pause detection)
        const transcriptionInterval = setInterval(() => {
          audioBuffer.checkAndTranscribe().catch(console.error);
        }, 500);
        
        mediaStreams.set(`interval_${callSid}`, transcriptionInterval);
      }
      
      if (message.event === 'media') {
        audioChunkCount++;
        
        // Log less frequently (every 100 chunks = ~5 seconds)
        if (audioChunkCount === 1 || audioChunkCount % 100 === 0) {
          const buffer = mediaStreams.get(`audioBuffer_${callSid}`);
          const bufferDuration = buffer ? 
            buffer.buffer.reduce((sum, chunk) => sum + Buffer.from(chunk, 'base64').length, 0) / 8000 : 
            0;
          console.log(`  🎤 Received chunk #${audioChunkCount} (buffered: ${bufferDuration.toFixed(1)}s)`);
        }
        
        // Buffer audio for Whisper STT
        const audioBuffer = mediaStreams.get(`audioBuffer_${callSid}`);
        if (audioBuffer && message.media.payload) {
          audioBuffer.addChunk(message.media.payload);
        }
      }
      
      if (message.event === 'stop') {
        console.log('  🛑 Media Stream stopped');
        if (callSid) {
          // Flush any remaining audio for transcription
          const audioBuffer = mediaStreams.get(`audioBuffer_${callSid}`);
          if (audioBuffer) {
            audioBuffer.flush().catch(console.error);
            mediaStreams.delete(`audioBuffer_${callSid}`);
          }
          
          // Clear transcription interval
          const interval = mediaStreams.get(`interval_${callSid}`);
          if (interval) {
            clearInterval(interval);
            mediaStreams.delete(`interval_${callSid}`);
          }
          
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

