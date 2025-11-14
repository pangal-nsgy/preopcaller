import ngrok from 'ngrok';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const PORT = process.env.PORT || 3000;
const NGROK_AUTH_TOKEN = process.env.NGROK_AUTH_TOKEN;

if (!NGROK_AUTH_TOKEN) {
  console.error('❌ Missing NGROK_AUTH_TOKEN in .env.local');
  process.exit(1);
}

console.log('🌐 Testing ngrok connection...\n');

try {
  // First, make sure localhost:3000 is reachable (server should be running)
  const testLocal = await fetch(`http://localhost:${PORT}/test`).catch(() => null);
  
  if (!testLocal || !testLocal.ok) {
    console.log('⚠️  Local server not running on port', PORT);
    console.log('   Starting server first...\n');
    // Server should be started separately
  }

  const url = await ngrok.connect({
    addr: PORT,
    authtoken: NGROK_AUTH_TOKEN,
  });

  console.log('✅ Ngrok tunnel established!');
  console.log(`   Public URL: ${url}`);
  console.log(`   Test it: ${url}/test`);
  console.log(`   Webhook URL: ${url}/webhook\n`);
  
  // Test the public URL
  const testPublic = await fetch(`${url}/test`);
  const data = await testPublic.json();
  
  console.log('✅ Public URL test successful!');
  console.log('   Response:', data.message, '\n');
  
  console.log('🛑 Disconnecting ngrok...');
  await ngrok.disconnect();
  console.log('✅ Done! Ngrok is working correctly.\n');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

