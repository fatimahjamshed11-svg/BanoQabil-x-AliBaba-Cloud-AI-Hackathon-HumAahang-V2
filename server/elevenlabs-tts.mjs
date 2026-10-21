import { SpeechError } from './errors.mjs';

export const MAX_TTS_TEXT = 3000;
export const MAX_TTS_AUDIO_BYTES = 8 * 1024 * 1024;

export function validateTtsInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['text', 'language'].includes(key)) ||
      typeof body.text !== 'string' || !body.text.trim() || body.text.length > MAX_TTS_TEXT ||
      !['en', 'ur', 'roman'].includes(body.language)) return false;
  return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(body.text);
}

export async function synthesizeElevenLabs(config, input, fetchImpl = fetch, signal) {
  if (!validateTtsInput(input) || !config.elevenlabsKey || !config.elevenlabsVoiceId) {
    throw new SpeechError('invalid_message');
  }
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), config.ttsTimeoutMs ?? 15000);
  const combined = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
  try {
    const response = await fetchImpl(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.elevenlabsVoiceId)}?output_format=mp3_44100_128`,
      {
        method: 'POST', redirect: 'error', signal: combined,
        headers: { 'xi-api-key': config.elevenlabsKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({
          text: input.text.trim(), model_id: config.elevenlabsTtsModel,
          language_code: input.language === 'en' ? 'en' : 'ur',
        }),
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new SpeechError('provider_unavailable');
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body ?? []) {
      size += chunk.length;
      if (size > MAX_TTS_AUDIO_BYTES) throw new SpeechError('provider_unavailable');
      chunks.push(chunk);
    }
    combined.throwIfAborted();
    if (!size) throw new SpeechError('provider_unavailable');
    return { audio: Buffer.concat(chunks), contentType: 'audio/mpeg' };
  } catch (error) {
    signal?.throwIfAborted();
    if (timeout.signal.aborted) throw new SpeechError('provider_unavailable');
    if (error instanceof SpeechError) throw error;
    throw new SpeechError('provider_unavailable');
  } finally {
    clearTimeout(timer);
  }
}
