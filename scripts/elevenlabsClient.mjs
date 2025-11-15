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
 * Convert text to speech using ElevenLabs REST API
 * Returns audio buffer (MP3 format by default)
 */
export async function textToSpeech(text, voiceId = ELEVENLABS_VOICE_ID) {
  if (!ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY not found in .env.local');
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: text,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs TTS failed: ${response.status} - ${errorText}`);
  }

  return await response.arrayBuffer();
}

/**
 * Convert audio buffer to mu-law format for Twilio
 * ElevenLabs returns MP3, we need to convert to mu-law PCM for Twilio
 */
export function convertAudioToMulaw(audioBuffer, sampleRate = 8000) {
  // This is a simplified conversion - for production you'd want to:
  // 1. Decode MP3 to PCM (using a library like lamejs or ffmpeg)
  // 2. Resample to 8000Hz (Twilio needs 8kHz)
  // 3. Convert PCM to mu-law
  
  // For now, this is a placeholder - we'll need an audio conversion library
  console.warn('⚠️  Audio conversion not fully implemented - need MP3 decoder');
  return audioBuffer;
}
