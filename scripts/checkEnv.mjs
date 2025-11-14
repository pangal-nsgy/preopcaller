import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const envPath = path.resolve(process.cwd(), '.env.local');

if (!fs.existsSync(envPath)) {
  console.error('Missing .env.local. Aborting.');
  process.exit(1);
}

const parsed = dotenv.parse(fs.readFileSync(envPath));
const requiredKeys = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'];
const missing = requiredKeys.filter((key) => !parsed[key]);

if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

console.log('Environment variables loaded successfully:');
requiredKeys.forEach((key) => {
  const value = parsed[key];
  const ends = value.slice(-4);
  console.log(`- ${key}: ...${ends}`);
});

dotenv.config({ path: envPath, override: true });

console.log('\nCheckpoint 2 complete ✅');

