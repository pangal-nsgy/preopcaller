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
const destination = process.argv[2] || '+19256993247'; // Default test number

if (!destination) {
  console.error('Usage: node scripts/testFullFlow.mjs [DESTINATION_E164]');
  process.exit(1);
}

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } = process.env;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
  console.error('❌ Missing Twilio credentials in .env.local');
  process.exit(1);
}

console.log('🚀 Starting full test flow...\n');
console.log('1️⃣ Starting Express server...\n');

// Start the Express server with Media Streams support
const server = spawn('node', ['scripts/serverWithMediaStreams.mjs'], {
  stdio: 'pipe',
});

let serverReady = false;
server.stdout.on('data', (data) => {
  const output = data.toString();
  process.stdout.write(output);
  if (output.includes('Server with Media Streams running')) {
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
    stdio: 'pipe', // Keep ngrok output separate
  });

  // Forward ngrok output
  ngrok.stdout.on('data', (data) => {
    // Only log if it contains useful info (not all the noise)
    const output = data.toString();
    if (output.includes('started tunnel') || output.includes('Session Status')) {
      process.stdout.write(`ngrok: ${output}`);
    }
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
          console.log('3️⃣ Making call with webhooks...\n');
          
          const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
          const statusCallback = `${publicUrl}/webhook/status`;
          const voiceUrl = `${publicUrl}/webhook/voice`;

          try {
            const call = await client.calls.create({
              to: destination,
              from: TWILIO_PHONE_NUMBER,
              url: voiceUrl,
              statusCallback: statusCallback,
              statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
              statusCallbackMethod: 'POST',
            });

            console.log('✅ Call initiated successfully!');
            console.log(`   Call SID: ${call.sid}`);
            console.log(`   Status: ${call.status}`);
            console.log(`   To: ${destination}`);
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

