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
  console.error('❌ OPENAI_API_KEY not found in .env.local');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Test with a real audio file
console.log('🧪 Testing Whisper with a real audio file...\n');

// We'll create a simple test or let user provide one
// For now, let's test by creating a WAV file programmatically

// Create a simple 1-second WAV file (8kHz mono, 16-bit PCM, silence)
function createTestWAV(durationSeconds = 1) {
  const sampleRate = 8000;
  const numSamples = sampleRate * durationSeconds;
  const pcmBuffer = Buffer.alloc(numSamples * 2); // 16-bit = 2 bytes per sample
  
  // Fill with silence (zeros) or simple tone
  for (let i = 0; i < numSamples; i++) {
    // Generate a simple 440Hz tone for testing
    const sample = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 16384;
    pcmBuffer.writeInt16LE(Math.floor(sample), i * 2);
  }
  
  // Create WAV header
  const wavHeader = Buffer.alloc(44);
  wavHeader.write('RIFF', 0);
  wavHeader.writeUInt32LE(36 + pcmBuffer.length, 4);
  wavHeader.write('WAVE', 8);
  wavHeader.write('fmt ', 12);
  wavHeader.writeUInt32LE(16, 16); // fmt chunk size
  wavHeader.writeUInt16LE(1, 20); // audio format (PCM)
  wavHeader.writeUInt16LE(1, 22); // num channels (mono)
  wavHeader.writeUInt32LE(sampleRate, 24); // sample rate
  wavHeader.writeUInt32LE(sampleRate * 2, 28); // byte rate
  wavHeader.writeUInt16LE(2, 32); // block align
  wavHeader.writeUInt16LE(16, 34); // bits per sample
  wavHeader.write('data', 36);
  wavHeader.writeUInt32LE(pcmBuffer.length, 40);
  
  return Buffer.concat([wavHeader, pcmBuffer]);
}

async function testWhisperWithFile(audioFile) {
  try {
    console.log(`📝 Transcribing: ${audioFile}\n`);
    
    // Read the file and create a File object
    const audioBuffer = fs.readFileSync(audioFile);
    
    // Create File object for OpenAI SDK
    // In Node.js, we need to use Blob/File polyfill or use FormData
    const { Blob } = await import('buffer');
    const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });
    const audioFileObj = new File([audioBlob], path.basename(audioFile), {
      type: 'audio/wav',
    });
    
    const transcription = await openai.audio.transcriptions.create({
      file: audioFileObj,
      model: 'whisper-1',
      language: 'en',
    });
    
    console.log('✅ Transcription successful!');
    console.log(`   Result: "${transcription.text}"\n`);
    return transcription.text;
  } catch (error) {
    console.error('❌ Transcription failed:', error.message);
    throw error;
  }
}

// Test 1: Create a test WAV file
console.log('1️⃣ Creating test WAV file (1 second of 440Hz tone)...\n');
const testWAV = createTestWAV(1);
const testFilePath = path.join(process.cwd(), 'test-audio.wav');
fs.writeFileSync(testFilePath, testWAV);
console.log(`✅ Created: ${testFilePath}\n`);

// Test 2: Transcribe it
testWhisperWithFile(testFilePath)
  .then(() => {
    console.log('✅ Whisper is working correctly!\n');
    // Clean up
    fs.unlinkSync(testFilePath);
    console.log('🧹 Cleaned up test file\n');
  })
  .catch((error) => {
    if (error.message.includes('File')) {
      console.error('\n⚠️  File API issue - trying alternative approach...\n');
      
      // Alternative: use FormData or direct buffer
      const audioBuffer = fs.readFileSync(testFilePath);
      const { Blob } = await import('buffer');
      const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });
      openai.audio.transcriptions.create({
        file: new File([audioBlob], 'test.wav', { type: 'audio/wav' }),
        model: 'whisper-1',
      })
      .then((transcription) => {
        console.log('✅ Transcription (alternative method):', transcription.text);
        fs.unlinkSync(testFilePath);
      })
      .catch((err) => {
        console.error('❌ Still failed:', err.message);
        process.exit(1);
      });
    } else {
      fs.unlinkSync(testFilePath);
      process.exit(1);
    }
  });

