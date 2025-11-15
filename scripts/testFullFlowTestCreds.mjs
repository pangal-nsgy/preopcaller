import { spawn } from 'child_process';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import twilio from 'twilio';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const PORT = 3000;

// Twilio test credentials use special test numbers
const TEST_TO_NUMBER = '+15005550006'; // Twilio's magic test number
const TEST_FROM_NUMBER = '+15005550001'; // Twilio's magic test from number

const { TWILIO_TEST_ACCOUNT_SID, TWILIO_TEST_AUTH_TOKEN } = process.env;

// Fall back to regular credentials if test ones aren't set
const ACCOUNT_SID = TWILIO_TEST_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = TWILIO_TEST_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN;
const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER || TEST_FROM_NUMBER;

if (!ACCOUNT_SID || !AUTH_TOKEN) {
  console.error('❌ Missing Twilio credentials in .env.local');
  console.error('   For test credentials, add:');
  console.error('   TWILIO_TEST_ACCOUNT_SID=your_test_sid');
  console.error('   TWILIO_TEST_AUTH_TOKEN=your_test_token');
  console.error('\n   Get them from: https://console.twilio.com/us1/account/settings');
  process.exit(1);
}

console.log('🧪 Using Twilio TEST credentials (simulated calls)');
console.log('   Test calls do NOT make real phone calls\n');
console.log('🚀 Starting full test flow...\n');
console.log('1️⃣ Starting Express server...\n');

// Start the Express server
const server = spawn('node', ['scripts/simpleServer.mjs'], {
  stdio: 'pipe',
});

let serverReady = false;
server.stdout.on('data', (data) => {
  const output = data.toString();
  process.stdout.write(output);
  if (output.includes('Simple server running')) {
    serverReady = true;
  }
});

server.stderr.on('data', (data) => {
  process.stderr.write(data);
});

// Wait for server to start, then start ngrok
setTimeout(() => {
  console.log('\n2️⃣ Starting ngrok tunnel...\n');
  
  const ngrok = spawn('ngrok', ['http', PORT.toString()], {
    stdio: 'pipe',
  });

  // Query ngrok API to get the public URL
  const getNgrokUrl = async () => {
    const maxRetries = 10;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const response = await fetch('http://localhost:4040/api/tunnels');
        const data = await response.json();
        
        if (data.tunnels && data.tunnels.length > 0) {
          const publicUrl = data.tunnels[0].public_url;
          console.log('✅ Ngrok tunnel established!');
          console.log(`   Public URL: ${publicUrl}\n`);
          
          // Make the call
          console.log('3️⃣ Making TEST call (simulated, not real)...\n');
          
          const client = twilio(ACCOUNT_SID, AUTH_TOKEN);
          const statusCallback = `${publicUrl}/webhook/status`;
          const voiceUrl = `${publicUrl}/webhook/voice`;

          try {
            const call = await client.calls.create({
              to: TEST_TO_NUMBER,
              from: FROM_NUMBER,
              url: voiceUrl,
              statusCallback: statusCallback,
              statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
              statusCallbackMethod: 'POST',
            });

            console.log('✅ Test call initiated successfully!');
            console.log(`   Call SID: ${call.sid}`);
            console.log(`   Status: ${call.status}`);
            console.log(`   To: ${TEST_TO_NUMBER} (Twilio test number)`);
            console.log(`   From: ${FROM_NUMBER}`);
            console.log(`   Status callback: ${statusCallback}`);
            console.log(`   Voice URL: ${voiceUrl}\n`);
            console.log('👀 Watch the server output above for webhook events...');
            console.log(`   Track call: https://console.twilio.com/us1/monitor/calls/${call.sid}\n`);
            console.log('⚠️  Press Ctrl+C to stop server and ngrok\n');
            
            // Keep processes running
            process.on('SIGINT', () => {
              console.log('\n\n🛑 Shutting down...');
              ngrok.kill();
              server.kill();
              process.exit(0);
            });

          } catch (error) {
            console.error('❌ Failed to initiate call:', error.message);
            if (error.message.includes('Trial')) {
              console.error('\n💡 Tip: This is a TEST call using test credentials.');
              console.error('   It simulates the call but doesn\'t make a real one.');
            }
            ngrok.kill();
            server.kill();
            process.exit(1);
          }
          
          return;
        }
      } catch (error) {
        // ngrok API not ready yet
        retries++;
        if (retries < maxRetries) {
          continue;
        } else {
          console.error('❌ Failed to get ngrok URL after retries');
          ngrok.kill();
          server.kill();
          process.exit(1);
        }
      }
    }
  };

  getNgrokUrl();

  // Cleanup on exit
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down...');
    ngrok.kill();
    server.kill();
    process.exit(0);
  });

}, 2000);

