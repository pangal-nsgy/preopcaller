import OpenAI from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.warn('⚠️  OPENAI_API_KEY not found in .env.local');
}

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

/**
 * Mu-law to PCM lookup table (more accurate than formula)
 * Pre-computed for all 256 possible mu-law values
 */
const MULAW_TO_PCM = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  // Invert mu-law byte (G.711 uses inverted encoding)
  const mulawByte = ~i & 0xFF;
  
  // Extract components
  const sign = (mulawByte & 0x80) >> 7;
  const exponent = (mulawByte & 0x70) >> 4;
  const mantissa = mulawByte & 0x0F;
  
  // G.711 mu-law decoding
  let linear = mantissa << 4;
  linear |= 0x84;
  linear = linear << exponent;
  linear -= 0x84;
  
  // Apply sign
  if (sign) {
    linear = -linear;
  }
  
  // Clamp to 16-bit range
  MULAW_TO_PCM[i] = Math.max(-32768, Math.min(32767, linear));
}

/**
 * Convert mu-law byte to linear PCM16 sample
 */
function mulawToLinear(mulawByte) {
  // Invert the mu-law byte (G.711 format)
  const inverted = ~mulawByte & 0xFF;
  return MULAW_TO_PCM[inverted];
}

/**
 * Convert mu-law audio (base64) to WAV format for Whisper
 * Twilio sends mu-law 8kHz, Whisper needs PCM16 WAV
 */
function convertMulawToWAV(mulawBase64) {
  const mulawBuffer = Buffer.from(mulawBase64, 'base64');
  const sampleRate = 8000; // Twilio uses 8kHz
  const numSamples = mulawBuffer.length;
  
  // Convert mu-law to linear PCM16
  const pcmBuffer = Buffer.alloc(numSamples * 2); // 16-bit = 2 bytes per sample
  
  for (let i = 0; i < numSamples; i++) {
    const mulawByte = mulawBuffer[i];
    const pcmValue = mulawToLinear(mulawByte);
    pcmBuffer.writeInt16LE(pcmValue, i * 2);
  }
  
  // Create WAV header (44 bytes)
  const wavHeader = Buffer.alloc(44);
  wavHeader.write('RIFF', 0);
  wavHeader.writeUInt32LE(36 + pcmBuffer.length, 4); // File size - 8
  wavHeader.write('WAVE', 8);
  wavHeader.write('fmt ', 12);
  wavHeader.writeUInt32LE(16, 16); // fmt chunk size
  wavHeader.writeUInt16LE(1, 20); // audio format (1 = PCM)
  wavHeader.writeUInt16LE(1, 22); // num channels (1 = mono)
  wavHeader.writeUInt32LE(sampleRate, 24); // sample rate
  wavHeader.writeUInt32LE(sampleRate * 2, 28); // byte rate (sample rate * bytes per sample)
  wavHeader.writeUInt16LE(2, 32); // block align (bytes per sample)
  wavHeader.writeUInt16LE(16, 34); // bits per sample
  wavHeader.write('data', 36);
  wavHeader.writeUInt32LE(pcmBuffer.length, 40); // data chunk size
  
  return Buffer.concat([wavHeader, pcmBuffer]);
}

/**
 * Transcribe audio using OpenAI Whisper
 * @param {string} audioBase64 - Base64-encoded mu-law audio from Twilio
 * @returns {Promise<string>} - Transcribed text
 */
export async function transcribeAudio(audioBase64) {
  if (!openai) {
    throw new Error('OPENAI_API_KEY not found in .env.local');
  }

  try {
    // Convert mu-law to WAV
    const wavBuffer = convertMulawToWAV(audioBase64);
    
    // DEBUG: Save audio files locally for inspection
    const debugDir = path.resolve(process.cwd(), 'debug-audio');
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }
    
    const timestamp = Date.now();
    const mulawPath = path.join(debugDir, `audio-${timestamp}.mulaw`);
    const wavPath = path.join(debugDir, `audio-${timestamp}.wav`);
    
    // Save raw mu-law audio
    const mulawBuffer = Buffer.from(audioBase64, 'base64');
    fs.writeFileSync(mulawPath, mulawBuffer);
    
    // Save WAV file that we'll send to Whisper
    fs.writeFileSync(wavPath, wavBuffer);
    
    // Calculate audio duration correctly
    // Mu-law: 8000 bytes per second (8kHz, 1 byte per sample)
    // WAV: header (44 bytes) + PCM16 data (2 bytes per sample, so same duration)
    const audioDuration = mulawBuffer.length / 8000;
    console.log(`  💾 Saved WAV: ${wavPath}`);
    console.log(`     Duration: ${audioDuration.toFixed(2)}s`);
    console.log(`     WAV size: ${wavBuffer.length} bytes`);
    console.log(`     Mu-law size: ${mulawBuffer.length} bytes`);
    console.log(`  💾 Saved raw: ${mulawPath}`);
    
    // Create File object for OpenAI SDK
    // In Node.js 18+, File and Blob are available globally
    // For older versions, we might need a polyfill
    let audioFile;
    
    try {
      // Try using File constructor (available in Node.js 20+)
      audioFile = new File([wavBuffer], 'audio.wav', { type: 'audio/wav' });
    } catch (e) {
      // Fallback: create Blob then File
      const { Blob } = await import('buffer');
      const audioBlob = new Blob([wavBuffer], { type: 'audio/wav' });
      audioFile = new File([audioBlob], 'audio.wav', { type: 'audio/wav' });
    }
    
    // Call Whisper API
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'en', // Optional: specify language for better accuracy
    });

    console.log(`  ✅ Whisper result: "${transcription.text}"`);
    return transcription.text;
  } catch (error) {
    console.error('❌ Whisper transcription error:', error.message);
    throw error;
  }
}

/**
 * Calculate RMS energy of audio buffer to detect speech vs silence
 */
function calculateAudioEnergy(mulawBuffer) {
  let sumSquares = 0;
  for (let i = 0; i < mulawBuffer.length; i++) {
    const mulawByte = mulawBuffer[i];
    // Quick mu-law to linear approximation for energy calculation
    let sign = mulawByte & 0x80;
    let exponent = (mulawByte & 0x70) >> 4;
    let mantissa = mulawByte & 0x0F;
    let linear = mantissa << (exponent + 3);
    linear |= 0x84 << exponent;
    linear = sign ? linear : -linear;
    sumSquares += linear * linear;
  }
  return Math.sqrt(sumSquares / mulawBuffer.length);
}

/**
 * Buffer audio chunks and transcribe intelligently
 * Uses voice activity detection and pause detection
 */
export class AudioBuffer {
  constructor(onTranscript, options = {}) {
    this.buffer = [];
    this.onTranscript = onTranscript;
    this.minBufferDurationMs = options.minBufferDurationMs || 5000; // 5 seconds minimum
    this.maxBufferDurationMs = options.maxBufferDurationMs || 15000; // 15 seconds max
    this.pauseDurationMs = options.pauseDurationMs || 1500; // 1.5s pause = end of sentence
    this.energyThreshold = options.energyThreshold || 1000; // Minimum energy for speech
    
    this.lastTranscriptionTime = Date.now();
    this.lastAudioTime = null; // Track when we last received audio with energy
    this.silenceStartTime = null; // Track when silence started
  }

  addChunk(audioBase64) {
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const energy = calculateAudioEnergy(audioBuffer);
    
    // Check if this chunk has actual speech (energy above threshold)
    const hasSpeech = energy > this.energyThreshold;
    
    if (hasSpeech) {
      this.lastAudioTime = Date.now();
      this.silenceStartTime = null;
      this.buffer.push(audioBase64);
    } else {
      // Silence/low energy - mark pause start if not already marked
      if (this.lastAudioTime && !this.silenceStartTime) {
        this.silenceStartTime = Date.now();
      }
      // Still buffer it (might be quiet speech or transition)
      this.buffer.push(audioBase64);
    }
  }

  async flush() {
    if (this.buffer.length === 0) return false;

    try {
      // Properly combine chunks: decode base64, concatenate as buffers
      const audioBuffers = this.buffer.map(chunk => Buffer.from(chunk, 'base64'));
      const combinedBuffer = Buffer.concat(audioBuffers);
      
      // Calculate audio duration (mu-law at 8kHz: 8000 bytes = 1 second)
      const audioDurationSeconds = combinedBuffer.length / 8000;
      
      // Check if we have enough audio
      if (audioDurationSeconds < 0.1) {
        this.buffer = [];
        return false;
      }
      
      // Calculate overall energy to verify it's actual speech
      const totalEnergy = calculateAudioEnergy(combinedBuffer);
      
      if (totalEnergy < this.energyThreshold) {
        console.log(`  🔇 Audio has low energy (${totalEnergy.toFixed(0)}), likely silence - skipping`);
        this.buffer = [];
        return false;
      }
      
      console.log(`  📤 Transcribing ${audioDurationSeconds.toFixed(2)}s of audio (energy: ${totalEnergy.toFixed(0)})...`);
      const combinedBase64 = combinedBuffer.toString('base64');
      this.buffer = [];

      const transcript = await transcribeAudio(combinedBase64);
      
      if (this.onTranscript && transcript.trim()) {
        this.onTranscript(transcript.trim(), true);
      }

      this.lastTranscriptionTime = Date.now();
      this.lastAudioTime = null;
      this.silenceStartTime = null;
      return true;
    } catch (error) {
      console.error('❌ Failed to transcribe buffered audio:', error.message);
      this.buffer = [];
      return false;
    }
  }

  async checkAndTranscribe() {
    if (this.buffer.length === 0) return;
    
    const now = Date.now();
    const bufferDuration = now - this.lastTranscriptionTime;
    const audioDurationSeconds = this.buffer.reduce((sum, chunk) => 
      sum + Buffer.from(chunk, 'base64').length, 0) / 8000;
    
    // Strategy 1: If we have enough audio AND detected a pause, transcribe
    if (audioDurationSeconds >= this.minBufferDurationMs / 1000 && 
        this.silenceStartTime && 
        (now - this.silenceStartTime) >= this.pauseDurationMs) {
      await this.flush();
      return;
    }
    
    // Strategy 2: If buffer is getting too long, transcribe anyway (max duration reached)
    if (audioDurationSeconds >= this.maxBufferDurationMs / 1000) {
      console.log(`  ⏰ Max buffer duration reached (${audioDurationSeconds.toFixed(2)}s), transcribing...`);
      await this.flush();
      return;
    }
    
    // Strategy 3: If we've had enough time and audio, but no recent speech, transcribe
    // (captures end of speech when caller stops talking)
    if (audioDurationSeconds >= this.minBufferDurationMs / 1000 && 
        this.lastAudioTime && 
        (now - this.lastAudioTime) >= this.pauseDurationMs) {
      await this.flush();
      return;
    }
  }
}

