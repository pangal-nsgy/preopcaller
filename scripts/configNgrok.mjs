import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const token = process.env.NGROK_AUTH_TOKEN;

if (!token) {
  console.error('❌ NGROK_AUTH_TOKEN not found in .env.local');
  process.exit(1);
}

try {
  await execAsync(`ngrok config add-authtoken ${token}`);
  console.log('✅ Ngrok configured with auth token');
} catch (error) {
  if (error.message.includes('already configured')) {
    console.log('✅ Ngrok auth token already configured');
  } else {
    console.error('❌ Error configuring ngrok:', error.message);
    process.exit(1);
  }
}

