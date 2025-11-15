import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test mu-law conversion with a known-good mu-law file
 * This will help us debug the conversion issue
 */

// G.711 mu-law decoding - trying a different implementation
function mulawDecode(mulawByte) {
  // Complement (invert) all bits
  mulawByte = ~mulawByte;
  
  // Extract sign, exponent, mantissa
  const sign = (mulawByte & 0x80) >> 7;
  const exponent = (mulawByte & 0x70) >> 4;
  const mantissa = mulawByte & 0x0F;
  
  // Decode according to G.711
  let linear = mantissa << 4;
  linear |= 0x84;
  linear = linear << exponent;
  linear -= 0x84;
  
  // Apply sign
  if (sign) {
    linear = -linear;
  }
  
  // Clamp to 16-bit
  return Math.max(-32768, Math.min(32767, linear));
}

// Alternative implementation - standard lookup table approach
const MULAW_LOOKUP = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  const sign = (i & 0x80) >> 7;
  const exponent = (i & 0x70) >> 4;
  const mantissa = i & 0x0F;
  
  let linear = mantissa << 4;
  linear |= 0x84;
  linear = linear << exponent;
  linear -= 0x84;
  
  if (sign) {
    linear = -linear;
  }
  
  MULAW_LOOKUP[i] = Math.max(-32768, Math.min(32767, linear));
}

function mulawToWAV(mulawBuffer) {
  const numSamples = mulawBuffer.length;
  const pcmBuffer = Buffer.alloc(numSamples * 2);
  
  // Invert mu-law bytes (G.711 uses inverted encoding)
  for (let i = 0; i < numSamples; i++) {
    const mulawByte = ~mulawBuffer[i] & 0xFF; // Invert and mask
    const pcmValue = MULAW_LOOKUP[mulawByte];
    pcmBuffer.writeInt16LE(pcmValue, i * 2);
  }
  
  // Create WAV header
  const wavHeader = Buffer.alloc(44);
  wavHeader.write('RIFF', 0);
  wavHeader.writeUInt32LE(36 + pcmBuffer.length, 4);
  wavHeader.write('WAVE', 8);
  wavHeader.write('fmt ', 12);
  wavHeader.writeUInt32LE(16, 16);
  wavHeader.writeUInt16LE(1, 20);
  wavHeader.writeUInt16LE(1, 22);
  wavHeader.writeUInt32LE(8000, 24);
  wavHeader.writeUInt32LE(16000, 28);
  wavHeader.writeUInt16LE(2, 32);
  wavHeader.writeUInt16LE(16, 34);
  wavHeader.write('data', 36);
  wavHeader.writeUInt32LE(pcmBuffer.length, 40);
  
  return Buffer.concat([wavHeader, pcmBuffer]);
}

// Test with saved audio file
const debugDir = path.resolve(process.cwd(), 'debug-audio');
if (fs.existsSync(debugDir)) {
  const files = fs.readdirSync(debugDir).filter(f => f.endsWith('.mulaw'));
  
  if (files.length > 0) {
    const testFile = path.join(debugDir, files[files.length - 1]); // Use most recent
    console.log(`🧪 Testing mu-law conversion with: ${testFile}\n`);
    
    const mulawBuffer = fs.readFileSync(testFile);
    console.log(`   Mu-law size: ${mulawBuffer.length} bytes`);
    console.log(`   First 20 bytes (hex): ${mulawBuffer.slice(0, 20).toString('hex')}\n`);
    
    // Convert using lookup table
    const wavBuffer = mulawToWAV(mulawBuffer);
    const testOutput = path.join(debugDir, 'test-converted.wav');
    fs.writeFileSync(testOutput, wavBuffer);
    
    console.log(`✅ Converted WAV saved: ${testOutput}`);
    console.log(`   WAV size: ${wavBuffer.length} bytes`);
    console.log(`   Duration: ${(mulawBuffer.length / 8000).toFixed(2)}s\n`);
    console.log(`👉 Play this file and compare with the original WAV to check quality.\n`);
  } else {
    console.log('❌ No .mulaw files found in debug-audio/');
    console.log('   Run a test call first to generate audio files.\n');
  }
} else {
  console.log('❌ debug-audio/ directory not found');
  console.log('   Run a test call first to generate audio files.\n');
}

