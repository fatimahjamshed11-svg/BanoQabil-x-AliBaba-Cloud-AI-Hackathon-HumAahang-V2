import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Readable } from 'node:stream';
import { SpeechError } from '../errors.mjs';
import { synthesizeElevenLabs, validateTtsInput } from '../elevenlabs-tts.mjs';

const config = {
  elevenlabsKey: 'elevenlabs-private-test-key',
  elevenlabsTtsModel: 'eleven_v4',
  elevenlabsVoiceId: 'GnmcdQ5D9NktfEwK2h3j',
  ttsTimeoutMs: 1000,
};

function response(status, chunks) {
  return { ok: status >= 200 && status < 300, status, body: Readable.from(chunks) };
}

test('validates only bounded supported-language TTS requests', () => {
  assert.equal(validateTtsInput({ text: 'السلام علیکم', language: 'ur' }), true);
  assert.equal(validateTtsInput({ text: 'Hello', language: 'en' }), true);
  assert.equal(validateTtsInput({ text: 'Roman Urdu', language: 'roman' }), true);
  assert.equal(validateTtsInput({ text: '', language: 'ur' }), false);
  assert.equal(validateTtsInput({ text: 'Hello', language: 'hi' }), false);
  assert.equal(validateTtsInput({ text: 'x'.repeat(3001), language: 'en' }), false);
  assert.equal(validateTtsInput({ text: 'bad\u0000text', language: 'en' }), false);
  assert.equal(validateTtsInput({ text: 'Hello', language: 'en', extra: true }), false);
});

test('sends Urdu text to the configured ElevenLabs voice and returns bounded MP3 bytes', async () => {
  let request;
  const result = await synthesizeElevenLabs(config, { text: 'السلام علیکم', language: 'ur' }, async (url, init) => {
    request = { url, init, body: JSON.parse(init.body) };
    return response(200, [Buffer.from('ID3'), Buffer.from('audio')]);
  });
  assert.match(request.url, /text-to-speech\/GnmcdQ5D9NktfEwK2h3j/);
  assert.match(request.url, /output_format=mp3_44100_128/);
  assert.equal(request.init.headers['xi-api-key'], config.elevenlabsKey);
  assert.deepEqual(request.body, { text: 'السلام علیکم', model_id: 'eleven_v4', language_code: 'ur' });
  assert.equal(result.contentType, 'audio/mpeg');
  assert.deepEqual(result.audio, Buffer.from('ID3audio'));
});

test('maps English to English and Roman Urdu to Urdu pronunciation', async () => {
  const bodies = [];
  const fetcher = async (_url, init) => { bodies.push(JSON.parse(init.body)); return response(200, [Buffer.from('x')]); };
  await synthesizeElevenLabs(config, { text: 'Hello', language: 'en' }, fetcher);
  await synthesizeElevenLabs(config, { text: 'Aap kaise hain', language: 'roman' }, fetcher);
  assert.deepEqual(bodies.map(body => body.language_code), ['en', 'ur']);
});

test('provider failures and oversized audio stay secret-safe', async () => {
  await assert.rejects(() => synthesizeElevenLabs(config, { text: 'Hello', language: 'en' }, async () => response(401, [Buffer.from('SECRET')]), undefined), error => {
    assert.ok(error instanceof SpeechError);
    assert.equal(error.code, 'provider_unavailable');
    assert.equal(error.message, 'provider_unavailable');
    return true;
  });
  await assert.rejects(() => synthesizeElevenLabs(config, { text: 'Hello', language: 'en' }, async () => response(200, [Buffer.alloc(8 * 1024 * 1024 + 1)])), { code: 'provider_unavailable' });
});
