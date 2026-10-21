import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { SpeechError } from './errors.mjs';

const MAX_FRAME = 256 * 1024;
const MAX_QUEUE = 256 * 1024;
const LANGUAGES = { en: 'eng', ur: 'urd' };
const ERROR_TYPES = new Set([
  'error', 'auth_error', 'quota_exceeded', 'transcriber_error', 'input_error',
  'invalid_request', 'commit_throttled', 'unaccepted_terms', 'rate_limited',
  'queue_overflow', 'resource_exhausted', 'session_time_limit_exceeded',
  'chunk_size_exceeded', 'insufficient_audio_activity',
]);

const safeLanguage = value => value === undefined ? undefined : LANGUAGES[value];

export function elevenLabsUrl(config, audio, inputLanguage) {
  if (!audio || audio.encoding !== 'linear16' || audio.channels !== 1 ||
      ![8000, 16000, 22050, 24000, 44100, 48000].includes(audio.sampleRate) ||
      (inputLanguage !== undefined && !safeLanguage(inputLanguage))) {
    throw new SpeechError('invalid_message');
  }
  const query = new URLSearchParams({
    model_id: config.elevenlabsSttModel ?? 'scribe_v2_realtime',
    audio_format: `pcm_${audio.sampleRate}`,
    commit_strategy: 'vad',
    vad_silence_threshold_secs: '0.5',
  });
  if (inputLanguage !== undefined) query.set('language_code', safeLanguage(inputLanguage));
  return `wss://api.elevenlabs.io/v1/speech-to-text/realtime?${query}`;
}

export function connectElevenLabs(config, audio, inputLanguage, {
  createSocket = (url, options) => new WebSocket(url, options),
  drainMs = 1200,
} = {}) {
  const adapter = new EventEmitter();
  const url = elevenLabsUrl(config, audio, inputLanguage);
  let socket;
  try {
    socket = createSocket(url, {
      headers: { 'xi-api-key': config.elevenlabsKey },
      handshakeTimeout: config.connectTimeoutMs ?? 10000,
      maxPayload: MAX_FRAME,
      perMessageDeflate: false,
      followRedirects: false,
    });
  } catch { throw new SpeechError('provider_unavailable'); }

  let terminal = false;
  let ready = false;
  let stopping = false;
  let sequence = 0;
  let queuedBytes = 0;
  let drainTimer;
  let lastResultTimer;

  Object.defineProperties(adapter, {
    readyState: { get: () => terminal ? WebSocket.CLOSED : ready ? socket.readyState : WebSocket.CONNECTING },
    bufferedAmount: { get: () => socket.bufferedAmount + queuedBytes },
  });

  function cleanup() {
    clearTimeout(drainTimer);
    clearTimeout(lastResultTimer);
    socket.off('open', onOpen);
    socket.off('message', onMessage);
    socket.off('error', onError);
    socket.off('close', onClose);
    socket.on('error', () => {});
  }

  function finishError(code = ready ? 'provider_interrupted' : 'provider_unavailable') {
    if (terminal) return;
    terminal = true;
    cleanup();
    try { adapter.emit('error', new SpeechError(code)); }
    finally {
      if (socket.readyState !== WebSocket.CLOSED) socket.terminate();
    }
  }

  function finishMetadata() {
    if (terminal) return;
    terminal = true;
    clearTimeout(drainTimer);
    clearTimeout(lastResultTimer);
    adapter.emit('message', Buffer.from(JSON.stringify({ type: 'Metadata' })), false);
    cleanup();
  }

  function sendFrame(frame) {
    if (terminal || socket.readyState !== WebSocket.OPEN) return;
    try { socket.send(JSON.stringify(frame), error => { if (error) finishError(); }); }
    catch { finishError(); }
  }

  function armDrain() {
    clearTimeout(lastResultTimer);
    lastResultTimer = setTimeout(finishMetadata, drainMs);
    lastResultTimer.unref?.();
  }

  adapter.terminate = () => {
    if (terminal) return;
    terminal = true;
    cleanup();
    if (socket.readyState !== WebSocket.CLOSED) socket.terminate();
  };

  adapter.send = (data, options) => {
    if (terminal) return;
    if (options?.binary) {
      if (!ready || stopping || !Buffer.isBuffer(data) || !data.length || data.length > 64 * 1024 || data.length % 2) {
        throw new SpeechError('invalid_message');
      }
      if (queuedBytes + data.length > MAX_QUEUE) throw new SpeechError('audio_limit');
      queuedBytes += data.length;
      const frame = { message_type: 'input_audio_chunk', audio_base_64: data.toString('base64'), commit: false, sample_rate: audio.sampleRate };
      try {
        socket.send(JSON.stringify(frame), error => { queuedBytes = Math.max(0, queuedBytes - data.length); if (error) finishError(); });
      } catch { queuedBytes = Math.max(0, queuedBytes - data.length); finishError(); }
      return;
    }
    try {
      const frame = JSON.parse(String(data));
      if (frame?.type === 'KeepAlive') return;
      if (frame?.type !== 'CloseStream' || stopping) throw new SpeechError('invalid_message');
      stopping = true;
      sendFrame({ message_type: 'input_audio_chunk', audio_base_64: '', commit: true, sample_rate: audio.sampleRate });
      drainTimer = setTimeout(finishMetadata, 3000);
      drainTimer.unref?.();
    } catch (error) { finishError(error instanceof SpeechError ? error.code : 'invalid_message'); }
  };

  function onOpen() {
    // ElevenLabs confirms the application session with session_started. Audio is
    // not accepted by runStream until that event exposes adapter open.
  }

  function onMessage(data, binary) {
    if (terminal || binary || data.length > MAX_FRAME) { if (!terminal) finishError('invalid_result'); return; }
    try {
      const frame = JSON.parse(data.toString('utf8'));
      const type = frame?.message_type;
      if (type === 'session_started') {
        if (ready) throw new SpeechError('invalid_result');
        ready = true;
        adapter.emit('open');
        return;
      }
      if (type === 'partial_transcript') return;
      if (type === 'committed_transcript' || type === 'committed_transcript_with_timestamps') {
        const transcript = frame.text;
        if (typeof transcript !== 'string' || transcript.length > 4000) throw new SpeechError('invalid_result');
        if (transcript.trim()) {
          adapter.emit('message', Buffer.from(JSON.stringify({ type: 'Results', is_final: true, start: sequence++, duration: 1,
            channel: { alternatives: [{ transcript }] } })), false);
        }
        if (stopping) armDrain();
        return;
      }
      if (ERROR_TYPES.has(type)) throw new SpeechError(ready ? 'provider_interrupted' : 'provider_unavailable');
      // Ignore non-transcription informational events while preserving the safe contract.
    } catch (error) { finishError(error instanceof SpeechError ? error.code : 'invalid_result'); }
  }

  function onError() { finishError(); }
  function onClose() {
    if (terminal) return;
    if (stopping) finishMetadata();
    else finishError(ready ? 'provider_interrupted' : 'provider_unavailable');
  }

  socket.on('open', onOpen);
  socket.on('message', onMessage);
  socket.on('error', onError);
  socket.on('close', onClose);
  return adapter;
}
