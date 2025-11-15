# pre-op-caller

## Project Outline

- **Goal**: Ship a minimal web platform that can place phone calls, hold an AI-driven voice conversation, and persist call transcripts and audio in a managed database.
- **Primary Users**: Internal operators triggering outbound calls through a web UI; call recipients interacting with the automated agent.
- **Success Criteria**: 
  - Reliable outbound calls through Twilio.
  - Real-time speech ↔ text loop with ElevenLabs and an open-source LLM.
  - Durable storage of call metadata, transcripts, and optional audio in Supabase.
  - Observability hooks (logging/monitoring) for debugging live conversations.

## Architecture Overview

1. **Frontend (Web UI)**
   - Trigger outbound call sessions.
   - Display live transcript stream and conversation status.
   - Allow operators to review past conversations.

2. **Backend API**
   - Orchestrate Twilio call creation and webhook handling.
   - Stream audio/text between Twilio, ElevenLabs, and the LLM loop.
   - Persist and fetch call records from Supabase.
   - Provide authentication/authorization (initially simple admin guard).

3. **AI Conversation Engine**
   - Inference service wrapping an open-source LLM (options: `gpt4all`, `Llama 3`, `Mistral 7B`).
   - Conversation state manager to maintain memory and guide responses.
   - Safety layer for prompt filtering and fallback behaviors.

4. **Data Layer (Supabase / PostgreSQL)**
   - Tables for calls, participants, transcript segments, audio assets.
   - Row-level security for future multi-tenant support.
   - Scheduled jobs for cleanup/archival.

5. **Observability**
   - Structured logging (e.g., pino/winston) and error reporting.
   - Metrics emitted to Supabase or a lightweight dashboard for call health.

## How Everything Connects (Data Flow)

### Why We Need a Web Server & Public URL

**The Problem**: Your computer (localhost) isn't directly accessible from the internet. Twilio, as an external service, needs to send you real-time audio data and receive instructions during a call. We need a web server running locally that Twilio can reach.

**The Solution**: Use a tunnel service (ngrok) that creates a temporary public URL pointing to your local server. Think of it like a phone number for your computer that Twilio can call.

### Real-Time Call Flow

```
┌─────────────┐
│   Operator  │  (You trigger a call via web UI)
│   (Web UI)  │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│            Your Local Web Server                         │
│  (Express/Next.js running on localhost:3000)            │
│  Exposed via ngrok → https://abc123.ngrok.io            │
└──────┬──────────────────────────────────────────────────┘
       │
       │ 1. Initiates call
       ▼
┌─────────────┐
│   Twilio    │  (Receives call request, dials phone number)
│   Voice API │
└──────┬──────┘
       │
       │ 2. Call answered, starts Media Stream
       │    (WebSocket connection to your server)
       ▼
┌─────────────────────────────────────────────────────────┐
│         Your Server Receives Audio Chunks                │
│         (Real-time WebSocket stream)                     │
└──────┬──────────────────────────────────────────────────┘
       │
       │ 3. Forward audio chunks
       ▼
┌─────────────┐
│ ElevenLabs  │  (Converts speech → text)
│     STT     │
└──────┬──────┘
       │
       │ 4. Returns transcribed text
       ▼
┌─────────────────────────────────────────────────────────┐
│         Your Server Processes Text                       │
│         (Adds to conversation context)                   │
└──────┬──────────────────────────────────────────────────┘
       │
       │ 5. Send text + context
       ▼
┌─────────────┐
│     LLM     │  (Generates response based on conversation)
│  (Ollama/   │
│   Mistral)  │
└──────┬──────┘
       │
       │ 6. Returns response text
       ▼
┌─────────────────────────────────────────────────────────┐
│         Your Server Receives LLM Response                │
│         (Text to be spoken)                              │
└──────┬──────────────────────────────────────────────────┘
       │
       │ 7. Send text
       ▼
┌─────────────┐
│ ElevenLabs  │  (Converts text → speech audio)
│     TTS     │
└──────┬──────┘
       │
       │ 8. Returns audio chunks
       ▼
┌─────────────────────────────────────────────────────────┐
│         Your Server Receives Audio                       │
│         (Ready to send to caller)                        │
└──────┬──────────────────────────────────────────────────┘
       │
       │ 9. Send audio back via WebSocket
       ▼
┌─────────────┐
│   Twilio    │  (Plays audio to caller)
│ Media Stream│
└──────┬──────┘
       │
       │ 10. Caller hears AI response
       ▼
┌─────────────┐
│   Caller    │  (Responds, cycle repeats)
│   (Phone)   │
└─────────────┘
```

### Key Points

- **Web Server Required**: Twilio needs to send you data in real-time. A web server receives WebSocket connections and HTTP webhooks.
- **Public URL Required (for local dev)**: ngrok creates a tunnel so Twilio can reach `localhost:3000` via `https://abc123.ngrok.io`.
  - **Important**: The server runs locally on your machine, but ngrok provides a public URL that anyone (or any service) can access.
  - During development: Use ngrok to expose your local server to the internet.
  - For production: Deploy the server to a hosting service (Vercel, Render, etc.) and use that permanent URL instead.
- **Real-Time Loop**: The entire cycle (audio → text → AI → text → audio) happens continuously during the call, creating a conversation.
- **All Happens in Parallel**: While the caller is speaking, we're processing previous chunks and preparing responses.

## Milestones

1. **Foundations**
   - Scaffold frontend (Next.js/React) and backend (Node/Express or Next API routes).
   - Configure Supabase project, environment variables, and DB schema migrations.

2. **Telephony Loop MVP**
   - Implement Twilio outbound call flow with webhooks.
   - Build audio ↔ text bridge: Twilio Media Streams → ElevenLabs STT/TTS.
   - Integrate LLM response generation with conversation state.

3. **Persistence & Review**
   - Store transcripts, call metadata, and audio snippets in Supabase.
   - Frontend views for call history and transcript playback.

4. **Polish & Reliability**
   - Add authentication, rate limiting, retries, and monitoring.
   - Write automated tests (unit + integration) for critical paths.
   - Harden deployment scripts and document operations.

## Technical Choices (Initial)

- **Frontend**: Next.js 14, React 18, Tailwind or Chakra for rapid UI.
- **Backend**: Express server with Node.js (chosen for simplicity and ease of Twilio/ngrok integration).
- **AI Stack**: 
  - Use an open-source model served via Ollama or hosted inference (evaluate latency).
  - Prompt engineering to align tone and guardrails.
- **Speech Services**: ElevenLabs Realtime APIs for STT/TTS.
- **Telephony**: Twilio Voice API + Media Streams.
- **Database**: Supabase (PostgreSQL + storage buckets + auth).
- **Deployment**: Vercel/Fly.io for frontend; Render/Fly.io/Heroku for backend if separated; Supabase managed hosting.

## Data Model (Draft)

- `calls`: id, external_call_id, direction, status, started_at, ended_at, duration, operator_id.
- `participants`: id, call_id, role (operator|contact|ai), phone_number, metadata.
- `transcript_segments`: id, call_id, speaker, text, sentiment, timestamp_start, timestamp_end, audio_url.
- `audio_assets`: id, call_id, segment_id, storage_path, duration, format.

## Security & Compliance Notes

- Secure environment variables and secrets via `.env.local` + deployment platform settings.
- Encrypt stored audio or restrict access to signed URLs.
- Respect Twilio/ElevenLabs acceptable use policies and consent requirements for recorded calls.
- Log redaction or hash sensitive personal information before persistence.

## Open Questions

- Final choice of open-source LLM model and hosting approach.
- Real-time conversation latency targets and acceptable delay budget.
- Need for human-in-the-loop (operator takeover) during live calls.
- Additional analytics or dashboards for call outcomes.

## Next Steps

- Confirm stack decisions and answer open questions above.
- Stand up project scaffolding (frontend/backend) with environment configuration.
- Prototype the telephony <-> AI loop in isolation before wiring the UI.

## Iterative Task List

1. **Foundational Setup**
   1.1 Register and verify Twilio account with a programmable voice number.  
   1.2 Create ElevenLabs account and obtain API keys for Realtime + TTS/STT.  
   1.3 Provision Supabase project (database + storage) and service role keys.  
   1.4 Select and provision open-source LLM hosting (local Ollama, hosted GPU, etc.).  
   1.5 Store credentials securely in `.env.local` and deployment secrets.

2. **Project Scaffolding**
   2.1 ✅ Initialize Express server with basic endpoints and ngrok integration.  
   2.2 ⏳ Configure TypeScript, linting, formatting, and basic CI (optional).  
   2.3 ⏳ Set up basic auth guard (temporary shared secret or Supabase auth).

3. **Telephony MVP**
   3.1 ✅ Build API endpoint to initiate outbound call via Twilio Programmable Voice.  
   3.2 ✅ Implement Twilio webhook receiver for call status + media stream events.  
   3.3 ✅ Test manual call flow with static TwiML response to validate connectivity.

4. **Voice ↔ Text Bridge**
   4.1 ✅ Stream audio from Twilio Media Streams - receiving real-time audio chunks via WebSocket.  
   4.2 ✅ Send audio chunks to Whisper STT; capture transcripts (using OpenAI Whisper API).  
   4.3 ✅ Convert text to speech using ElevenLabs TTS (generating MP3 audio).  
   4.4 ⚠️  **BLOCKED**: Mu-law to WAV conversion producing poor quality - need to fix audio conversion.
   4.5 ⏳ Convert TTS audio (MP3) back to mu-law format for Twilio Media Streams.
   4.6 ⏳ Send TTS audio back to Twilio stream to complete conversation loop.
   4.7 ⏳ Implement buffering/error handling for low-latency loop.

5. **Conversation Engine**
   5.1 Wrap chosen LLM with prompt template and conversation memory store.  
   5.2 Integrate LLM responses into speech bridge for real-time dialogue.  
   5.3 Add guardrails (fallback prompts, profanity filter, escalation triggers).

6. **Persistence Layer**
   6.1 Define Supabase schema migrations for calls, participants, transcripts, audio.  
   6.2 Persist call metadata and transcript segments during live session.  
   6.3 Upload audio snippets (optional) to Supabase storage with signed URLs.

7. **Frontend Experience**
   7.1 Build operator dashboard to trigger calls and monitor live status.  
   7.2 Display streaming transcript and call controls (cancel, pause, etc.).  
   7.3 Implement history view with searchable transcripts and playback.

8. **Testing & Reliability**
   8.1 Write unit tests for API orchestration and conversation logic.  
   8.2 Add integration tests or manual runbooks for telephony loop.  
   8.3 Instrument structured logging, alerting, and health checks.

9. **Deployment & Ops**
   9.1 Choose hosting targets (e.g., Vercel + Supabase + Ollama server).  
   9.2 Configure environment variables and secrets for each environment.  
   9.3 Document deployment pipeline and rollback procedures.

10. **Polish & Stretch Goals**
   10.1 Add analytics (call outcomes, sentiment summaries).  
   10.2 Support inbound calls or SMS follow-ups.  
   10.3 Explore human-in-the-loop controls and CRM integrations.

## Progress Log

- **Thu Nov 13 21:25:55 PST 2025**
  - Created `.env.local` and verified Twilio credentials via `scripts/checkEnv.mjs`.
  - Built `scripts/testCall.mjs` and successfully queued outbound test call (SID `CA169221b6da74a536f9cdf4bec11136f0`).
  - Added `.gitignore`, initialized npm project, and installed `dotenv` + `twilio`.

- **Fri Nov 14 14:47:37 PST 2025**
  - **Checkpoint 1**: Verified Twilio credentials loaded correctly from `.env.local`.
  - **Checkpoint 2**: Confirmed environment variables load successfully via `scripts/checkEnv.mjs`.
  - **Checkpoint 3**: Successfully tested Twilio outbound call functionality - call queued and completed.
  - **Checkpoint 4**: Set up Express server and ngrok tunnel infrastructure.
    - Created simple Express server (`scripts/simpleServer.mjs`) running on `localhost:3000`.
    - Installed ngrok binary via Homebrew.
    - Configured ngrok with auth token via `scripts/configNgrok.mjs`.
    - Created `scripts/testNgrokSimple.mjs` to test server + ngrok integration.
    - ✅ **Verified**: Public ngrok URL successfully forwards to local server - connectivity confirmed.
    - Server runs locally but is accessible from the internet via ngrok public URL (required for Twilio webhooks).

- **Fri Nov 14 16:16:26 PST 2025**
  - **Checkpoint 5**: Implemented Twilio webhook receiver and Media Streams support.
    - Created `scripts/serverWithMediaStreams.mjs` with WebSocket server for real-time audio streaming.
    - Added webhook endpoints: `/webhook/status` (call status updates) and `/webhook/voice` (TwiML instructions).
    - Installed `ws` package for WebSocket support.
    - Implemented Media Streams connection handling - receives real-time audio chunks from Twilio during calls.
    - Created `scripts/testFullFlow.mjs` - automated script that starts server, ngrok, and initiates call with webhooks.
    - ✅ **Verified**: Twilio webhooks successfully reaching server via ngrok tunnel.
    - ✅ **Verified**: Media Stream WebSocket connection opens when call starts.
    - ✅ **Verified**: Real-time audio chunks being received from caller (base64-encoded mu-law format, ~50ms intervals).
    - Audio chunks logged to console every ~1 second during active speech.
    - Next step: Send audio chunks to ElevenLabs STT for speech-to-text conversion.

- **Sat Nov 15 10:05:15 PST 2025**
  - **Checkpoint 6**: Integrated Whisper STT and ElevenLabs TTS.
    - Installed OpenAI SDK for Whisper API integration.
    - Installed `@elevenlabs/elevenlabs-js` for TTS.
    - Created `scripts/whisperSTT.mjs` - Whisper STT integration with mu-law to WAV conversion.
    - Created `scripts/elevenlabsClient.mjs` - ElevenLabs TTS REST API client.
    - Implemented smart audio buffering with Voice Activity Detection (VAD) and pause detection.
    - Audio buffering strategy: 5-15 second buffers, transcribe on 1.5s pauses (sentence boundaries).
    - ✅ **Verified**: Whisper STT working - receiving transcripts from audio chunks.
    - ✅ **Verified**: ElevenLabs TTS working - generating audio from text responses.
    - ✅ **Verified**: Full loop: Audio → Whisper → Text → Echo → ElevenLabs TTS → Audio (TTS audio not yet sent back to Twilio).
    - Added audio file debugging - saves mu-law and WAV files to `debug-audio/` folder.
    - Created test scripts: `testElevenLabs.mjs`, `testWhisper.mjs`, `testMulawConversion.mjs`.
    - **CURRENT BOTTLENECK**: Mu-law to WAV audio conversion producing poor quality audio (static/noise).
      - Manual G.711 mu-law decoding implementation appears incorrect.
      - Audio files saved for debugging - need to verify conversion algorithm or use FFmpeg/library.
    - **CURRENT BOTTLENECK**: TTS audio (MP3 from ElevenLabs) not yet converted back to mu-law for Twilio Media Streams.

## Issues & Resolutions

- Initial `git push` failed with SSL certificate error; reran command with elevated permissions to allow access to system CA bundle.
- `.env.local` reads failed under sandbox restrictions; reran scripts with `required_permissions=['all']` to grant read access.
- ngrok npm package v5 beta had connection issues with local API; switched to using ngrok binary CLI directly via Homebrew installation, which resolved connectivity issues.
- Initial ngrok integration was overly complex; simplified to basic Express server + ngrok CLI spawn for reliable tunnel creation.
- Old server process (`simpleServer.mjs`) was still running and handling requests instead of new Media Streams server; killed old processes to ensure correct server instance handles requests.
- WebSocket URL needed to use `wss://` (not `ws://`) for ngrok HTTPS tunnels.
- Twilio webhook endpoint needed GET handler in addition to POST (Twilio may send GET for verification/redirect).
- **CURRENT ISSUE**: Mu-law to WAV audio conversion producing static/trash audio quality.
  - Manual G.711 mu-law decoding algorithm may be incorrect.
  - Audio files saved to `debug-audio/` for inspection.
  - Potential solutions: Use FFmpeg for conversion, verify G.711 formula, or use tested mu-law library.
  - Twilio Media Streams only supports mu-law format - conversion required.
- Transcription quality poor - likely due to audio conversion issues rather than Whisper quality.
- ElevenLabs Realtime API requires paid plan - using REST API for TTS instead (works but less efficient).
