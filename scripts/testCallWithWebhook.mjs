import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import twilio from 'twilio';

const envPath = path.resolve(process.cwd(), '.env.local');

if (!fs.existsSync(envPath)) {
  console.error('Missing .env.local. Run scripts/checkEnv.mjs first.');
  process.exit(1);
}

dotenv.config({ path: envPath });

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } = process.env;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
  console.error('Missing Twilio credentials. Run scripts/checkEnv.mjs to verify.');
  process.exit(1);
}

const destination = process.argv[2];
const webhookBaseUrl = process.argv[3]; // ngrok URL

if (!destination) {
  console.error('Usage: node scripts/testCallWithWebhook.mjs <DESTINATION_E164> <WEBHOOK_BASE_URL>');
  console.error('Example: node scripts/testCallWithWebhook.mjs +19256993247 https://abc123.ngrok-free.app');
  process.exit(1);
}

if (!webhookBaseUrl) {
  console.error('❌ Missing webhook base URL (your ngrok URL)');
  console.error('   Start your server with ngrok first: npm run test-ngrok');
  console.error('   Then copy the ngrok URL and use it here.');
  process.exit(1);
}

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

const statusCallback = `${webhookBaseUrl}/webhook/status`;
const voiceUrl = `${webhookBaseUrl}/webhook/voice`;

console.log('📞 Making call with webhooks:');
console.log(`   To: ${destination}`);
console.log(`   Status callback: ${statusCallback}`);
console.log(`   Voice URL: ${voiceUrl}\n`);

(async () => {
  try {
    const call = await client.calls.create({
      to: destination,
      from: TWILIO_PHONE_NUMBER,
      url: voiceUrl,
      statusCallback: statusCallback,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
    });

    console.log('✅ Call initiated successfully:');
    console.log(`   Call SID: ${call.sid}`);
    console.log(`   Status: ${call.status}`);
    console.log(`   Track in console: https://console.twilio.com/us1/monitor/calls/${call.sid}\n`);
    console.log('👀 Watch your server console for webhook events...\n');
  } catch (error) {
    console.error('❌ Failed to initiate call:');
    console.error(error.message);
    process.exit(1);
  }
})();

