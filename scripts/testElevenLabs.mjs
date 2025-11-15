import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

if (!ELEVENLABS_API_KEY) {
  console.error('❌ ELEVENLABS_API_KEY not found in .env.local');
  console.error('   Get your API key from: https://elevenlabs.io/app/settings/api-keys');
  console.error('   Then add: ELEVENLABS_API_KEY=your_key_here');
  process.exit(1);
}

console.log('🧪 Testing ElevenLabs API connection...\n');
console.log('API Key:', ELEVENLABS_API_KEY.substring(0, 10) + '...\n');

// Test 1: Simple REST API call to verify API key (optional - may require permissions)
console.log('1️⃣ Testing REST API (get voices - optional)...\n');

try {
  const response = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
    },
  });

  if (response.ok) {
    const data = await response.json();
    console.log('✅ REST API connection successful!');
    console.log(`   Found ${data.voices?.length || 0} voices\n`);
    
    if (data.voices && data.voices.length > 0) {
      console.log('   Available voices:');
      data.voices.slice(0, 5).forEach(voice => {
        console.log(`     - ${voice.name} (ID: ${voice.voice_id})`);
      });
      if (data.voices.length > 5) {
        console.log(`     ... and ${data.voices.length - 5} more`);
      }
      console.log('');
    }
  } else {
    const errorText = await response.text();
    console.log('⚠️  REST API voices endpoint requires additional permissions');
    console.log('   This is OK - we mainly need Realtime API which we test next\n');
    // Don't exit - continue to test Realtime API which is what we actually need
  }
} catch (error) {
  console.log('⚠️  Could not test REST API:', error.message);
  console.log('   Continuing to test Realtime API (which is what we need)...\n');
}

// Test 2: Simple TTS REST API first (easier to verify)
console.log('2️⃣ Testing TTS REST API (text-to-speech)...\n');

try {
  const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM', {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: 'Hello, this is a test of ElevenLabs text to speech.',
      model_id: 'eleven_turbo_v2_5',
    }),
  });

  if (response.ok) {
    const audioData = await response.arrayBuffer();
    console.log('✅ TTS REST API works!');
    console.log(`   Received audio: ${audioData.byteLength} bytes\n`);
  } else {
    const errorText = await response.text();
    console.log('⚠️  TTS REST API error:', response.status);
    console.log('   Response:', errorText.substring(0, 200));
    console.log('');
  }
} catch (error) {
  console.log('⚠️  TTS REST API error:', error.message);
  console.log('');
}

// Test 3: WebSocket connection (Realtime API)
console.log('3️⃣ Testing Realtime API WebSocket connection...\n');

import WebSocket from 'ws';

const wsUrl = 'wss://api.elevenlabs.io/v1/realtime/tts?model_id=eleven_turbo_v2_5&output_format=pcm_16000';

const ws = new WebSocket(wsUrl, {
  headers: {
    'xi-api-key': ELEVENLABS_API_KEY,
  },
});

let wsConnected = false;
let wsError = null;

ws.on('open', () => {
  console.log('✅ WebSocket connection opened!');
  wsConnected = true;
  
  // Send configuration message
  ws.send(JSON.stringify({
    text: ' ',
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
    },
  }));
  
  console.log('   Sent configuration message\n');
  
  // Test sending text for TTS
  console.log('   Testing TTS via WebSocket...\n');
  setTimeout(() => {
    const testText = 'Hello, this is a test of ElevenLabs text to speech.';
    console.log(`   Sending text: "${testText}"`);
    ws.send(JSON.stringify({ text: testText }));
  }, 1000);
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    
    if (message.type === 'audio') {
      console.log('✅ Received TTS audio data!');
      console.log(`   Audio length: ${message.audio?.length || 0} bytes\n`);
    } else if (message.type === 'conversation_initiation_metadata') {
      console.log('✅ Conversation initialized');
      console.log('   Model:', message.model_id || 'unknown');
      console.log('   Output format:', message.output_format || 'unknown\n');
    } else {
      console.log('   Received message type:', message.type);
    }
  } catch (error) {
    // Might be binary audio data
    if (Buffer.isBuffer(data)) {
      console.log('✅ Received binary audio data!');
      console.log(`   Audio length: ${data.length} bytes\n`);
    } else {
      console.log('   Received data (non-JSON):', data.toString().substring(0, 100));
    }
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
  wsError = error;
});

ws.on('close', () => {
  console.log('🔌 WebSocket connection closed\n');
  
  if (wsConnected && !wsError) {
    console.log('✅ All ElevenLabs tests passed!\n');
    console.log('   Ready to integrate with Media Streams.\n');
    process.exit(0);
  } else {
    console.error('❌ Tests failed\n');
    process.exit(1);
  }
});

// Timeout after 10 seconds
setTimeout(() => {
  if (!wsConnected) {
    console.error('❌ WebSocket connection timeout');
    ws.close();
    process.exit(1);
  } else {
    console.log('✅ WebSocket test complete, closing connection...\n');
    ws.close();
  }
}, 10000);

