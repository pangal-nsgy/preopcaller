import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const envPath = path.resolve(projectRoot, '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const PORT = process.env.PORT || 3000;
const NGROK_AUTH_TOKEN = process.env.NGROK_AUTH_TOKEN;

if (!NGROK_AUTH_TOKEN) {
  console.error('❌ Missing NGROK_AUTH_TOKEN in .env.local');
  console.error('   Get your auth token from: https://dashboard.ngrok.com/get-started/your-authtoken');
  console.error('   Then add: NGROK_AUTH_TOKEN=your_token_here');
  process.exit(1);
}

// Configure ngrok with auth token (async IIFE)
(async () => {
  console.log('🔐 Configuring ngrok with auth token...');
  try {
    await execAsync(`ngrok config add-authtoken ${NGROK_AUTH_TOKEN}`);
    console.log('✅ Ngrok configured\n');
  } catch (error) {
    // Token might already be configured, that's ok
    if (!error.message.includes('already configured')) {
      console.log('⚠️  Note: Token may already be configured\n');
    }
  }
})();

// Start the Express server
console.log('🚀 Starting Express server...');
const server = spawn('node', ['scripts/startServer.mjs'], {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: true,
});

// Wait a bit for server to start, then start ngrok
setTimeout(async () => {
  try {
    console.log('🌐 Starting ngrok tunnel...');
    
    // Start ngrok using the CLI (silent mode)
    const ngrok = spawn('ngrok', ['http', PORT.toString(), '--log=stdout'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let ngrokOutput = '';
    
    // Collect all output
    ngrok.stdout.on('data', (data) => {
      ngrokOutput += data.toString();
    });

    ngrok.stderr.on('data', (data) => {
      ngrokOutput += data.toString();
    });

    // Query ngrok API to get the public URL (more reliable)
    const checkNgrokUrl = async () => {
      try {
        // Wait a bit for ngrok to start
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Query ngrok's local API
        const response = await fetch('http://localhost:4040/api/tunnels');
        const data = await response.json();
        
        if (data.tunnels && data.tunnels.length > 0) {
          const publicUrl = data.tunnels[0].public_url;
          console.log('\n✅ Ngrok tunnel established!');
          console.log(`   Public URL: ${publicUrl}`);
          console.log(`   Local URL: http://localhost:${PORT}`);
          console.log(`   Test it: ${publicUrl}/test`);
          console.log(`   Webhook URL: ${publicUrl}/webhook`);
          console.log(`   Ngrok dashboard: http://localhost:4040\n`);
          console.log('⚠️  Keep this process running. Press Ctrl+C to stop.\n');
        } else {
          console.log('⏳ Waiting for ngrok tunnel...');
          // Retry after 1 second
          setTimeout(checkNgrokUrl, 1000);
        }
      } catch (error) {
        // ngrok API not ready yet, retry
        setTimeout(checkNgrokUrl, 1000);
      }
    };

    checkNgrokUrl();

    // Handle cleanup
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down...');
      ngrok.kill();
      server.kill();
      process.exit(0);
    });

    // Handle errors
    ngrok.on('error', (error) => {
      console.error('❌ Failed to start ngrok:', error.message);
      server.kill();
      process.exit(1);
    });

  } catch (error) {
    console.error('❌ Failed to start ngrok:', error.message);
    server.kill();
    process.exit(1);
  }
}, 2000);

