import { spawn } from 'child_process';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const PORT = 3000;

console.log('1️⃣ Starting simple server...\n');

// Start the simple server
const server = spawn('node', ['scripts/simpleServer.mjs'], {
  stdio: 'inherit',
});

// Wait 2 seconds for server to start, then start ngrok
setTimeout(() => {
  console.log('2️⃣ Starting ngrok tunnel...\n');
  
  // Start ngrok - it will print the URL to stdout
  const ngrok = spawn('ngrok', ['http', PORT.toString()], {
    stdio: 'inherit',
  });

  console.log('3️⃣ Check http://localhost:4040 for your ngrok URL\n');
  console.log('   Or look above for the forwarding URL\n');
  console.log('⚠️  Press Ctrl+C to stop both server and ngrok\n');

  // Cleanup on exit
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Stopping...');
    ngrok.kill();
    server.kill();
    process.exit(0);
  });

}, 2000);

