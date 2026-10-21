import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { connectElevenLabs, elevenLabsUrl } from '../elevenlabs-stt.mjs';

class Socket extends EventEmitter {
  readyState = 0;
  bufferedAmount = 0;
  frames = [];
  send(data, callback) {
    this.frames.push(JSON.parse(String(data)));
    callback?.();
  }
  open() { this.readyState = 1; this.emit('open'); }
  receive(frame) { this.emit('message', Buffer.from(JSON.stringify(frame)), false); }
  terminate() { this.readyState = 3; this.emit('close'); }
}

const audio = { encoding: 'linear16', channels: 1, sampleRate: 24000 };
const config = { elevenlabsKey: 'elevenlabs-private-test-key', elevenlabsSttModel: 'scribe_v2_realtime' };

function setup(language, options = {}) {
  const socket = new Socket();
  const messages = [];
  const errors = [];
  const adapter = connectElevenLabs(config, audio, language, {
    createSocket: (url, request) => { socket.request = { url, request }; return socket; },
    drainMs: 5,
  });
  adapter.on('message', (data) => messages.push(JSON.parse(String(data))));
  adapter.on('error', (error) => errors.push(error));
  return { socket, adapter, messages, errors, ...options };
}

function ready(t) {
  t.socket.open();
  t.socket.receive({ message_type: 'session_started', session_id: 'test-session' });
}

test('builds an authenticated Urdu realtime session with explicit urd language', () => {
  const url = new URL(elevenLabsUrl(config, audio, 'ur'));
  assert.equal(url.protocol, 'wss:');
  assert.equal(url.pathname, '/v1/speech-to-text/realtime');
  assert.equal(url.searchParams.get('model_id'), 'scribe_v2_realtime');
  assert.equal(url.searchParams.get('audio_format'), 'pcm_24000');
  assert.equal(url.searchParams.get('language_code'), 'urd');
  assert.equal(url.searchParams.get('commit_strategy'), 'vad');
});

test('maps English to eng and rejects unsupported languages or audio', () => {
  const url = new URL(elevenLabsUrl(config, audio, 'en'));
  assert.equal(url.searchParams.get('language_code'), 'eng');
  assert.throws(() => elevenLabsUrl(config, audio, 'hi'), { code: 'invalid_message' });
  assert.throws(() => elevenLabsUrl(config, { ...audio, sampleRate: 44100, encoding: 'opus' }, 'en'), { code: 'invalid_message' });
});

test('waits for session_started, forwards PCM chunks, and emits normalized final Results', () => {
  const t = setup('ur');
  t.socket.open();
  assert.equal(t.messages.length, 0);
  t.socket.receive({ message_type: 'session_started' });
  assert.equal(t.adapter.readyState, 1);
  t.adapter.send(Buffer.from([1, 0, 2, 0]), { binary: true });
  const chunk = t.socket.frames.at(-1);
  assert.equal(chunk.message_type, 'input_audio_chunk');
  assert.equal(chunk.commit, false);
  assert.equal(chunk.sample_rate, 24000);
  assert.equal(Buffer.from(chunk.audio_base_64, 'base64').length, 4);
  t.socket.receive({ message_type: 'partial_transcript', text: 'جزوی' });
  t.socket.receive({ message_type: 'committed_transcript', text: 'مکمل نتیجہ۔' });
  assert.deepEqual(t.messages.map(frame => [frame.type, frame.start, frame.channel.alternatives[0].transcript]),
    [['Results', 0, 'مکمل نتیجہ۔']]);
  t.adapter.terminate();
});

test('commits and drains after the final ElevenLabs result', async () => {
  const t = setup('en');
  ready(t);
  t.adapter.send(JSON.stringify({ type: 'CloseStream' }));
  assert.deepEqual(t.socket.frames.at(-1), { message_type: 'input_audio_chunk', audio_base_64: '', commit: true, sample_rate: 24000 });
  t.socket.receive({ message_type: 'committed_transcript', text: 'Final.' });
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.deepEqual(t.messages.map(frame => frame.type), ['Results', 'Metadata']);
  assert.deepEqual(t.errors, []);
});

test('sanitizes provider errors and does not expose provider text', () => {
  const t = setup('ur');
  ready(t);
  t.socket.receive({ message_type: 'auth_error', error: 'SECRET API key details' });
  assert.deepEqual(t.errors.map(error => [error.code, error.message]), [['provider_interrupted', 'provider_interrupted']]);
  assert.deepEqual(t.messages, []);
});
