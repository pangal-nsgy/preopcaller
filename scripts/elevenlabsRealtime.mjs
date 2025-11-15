import WebSocket from 'ws';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // Default: Rachel

/**
 * Create ElevenLabs Realtime API WebSocket connection
 * This handles both STT (speech-to-text) and TTS (text-to-speech)
 */
export function createElevenLabsConnection(callSid, onTranscript, onAudioChunk) {
  if (!ELEVENLABS_API_KEY) {
    console.error('❌ ELEVENLABS_API_KEY not found in .env.local');
    return null;
  }

  const wsUrl = `wss://api.elevenlabs.io/v1/realtime/tts?model_id=eleven_turbo_v2_5&output_format=pcm_16000`;
  
  const ws = new WebSocket(wsUrl, {
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
    },
  });

  ws.on('open', () => {
    console.log(`  ✅ ElevenLabs Realtime connection opened for call ${callSid}`);
    
    // Configure the connection
    ws.send(JSON.stringify({
      text: ' ',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
      generation_config: {
        chunk_length_schedule: [120, 160, 250, 290],
      },
    }));
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'audio') {
        // TTS audio from ElevenLabs (PCM format)
        if (onAudioChunk) {
          onAudioChunk(message.audio);
        }
      } else if (message.type === 'transcript') {
        // STT transcript from ElevenLabs
        if (onTranscript && message.text) {
          onTranscript(message.text, message.is_final);
        }
      } else if (message.type === 'conversation_initiation_metadata') {
        console.log('  📝 ElevenLabs conversation initialized');
      }
    } catch (error) {
      // Handle binary audio data
      if (Buffer.isBuffer(data)) {
        if (onAudioChunk) {
          onAudioChunk(data);
        }
      }
    }
  });

  ws.on('error', (error) => {
    console.error(`  ❌ ElevenLabs WebSocket error:`, error.message);
  });

  ws.on('close', () => {
    console.log(`  🔌 ElevenLabs Realtime connection closed for call ${callSid}`);
  });

  return {
    ws,
    sendAudio: (audioBase64) => {
      // Send audio to ElevenLabs for STT
      // Convert mu-law to PCM first
      const audioBuffer = Buffer.from(audioBase64, 'base64');
      // For now, send as-is (ElevenLabs might accept mu-law or we need conversion)
      ws.send(audioBuffer);
    },
    sendText: (text) => {
      // Send text to ElevenLabs for TTS
      ws.send(JSON.stringify({ text }));
    },
    close: () => {
      ws.close();
    },
  };
}

