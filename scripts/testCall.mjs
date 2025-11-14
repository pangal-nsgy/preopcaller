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

if (!destination) {
  console.error('Usage: node scripts/testCall.mjs <DESTINATION_E164>');
  process.exit(1);
}

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

const message = encodeURIComponent(
  '<Response><Say voice="alice">Hello from the pre op caller test. This verifies outbound calling is configured. Goodbye.</Say></Response>',
);
const twimlUrl = `https://twimlets.com/echo?Twiml=${message}`;

(async () => {
  try {
    const call = await client.calls.create({
      to: destination,
      from: TWILIO_PHONE_NUMBER,
      url: twimlUrl,
    });

    console.log('Call initiated successfully:');
    console.log(`- SID: ${call.sid}`);
    console.log(`- Status: ${call.status}`);
    console.log(`Track call in Twilio console: https://console.twilio.com/us1/monitor/calls/${call.sid}`);
  } catch (error) {
    console.error('Failed to initiate call:');
    console.error(error.message);
    process.exit(1);
  }
})();

