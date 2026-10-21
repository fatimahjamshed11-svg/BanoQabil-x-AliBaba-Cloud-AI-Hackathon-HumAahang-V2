import { createCaptionTransport } from './caption-transport';
import { ensureServiceConnection } from './service-bootstrap';
import { serviceBaseUrl, serviceCredentials } from './service-connection';
import type { PlaybackEngine } from './quick-speak-model';

type PlaybackCallbacks = Parameters<PlaybackEngine['speak']>[1];

export function createElevenLabsWebPlayback(): PlaybackEngine | null {
  if (typeof window === 'undefined' || typeof window.Audio !== 'function') return null;
  const fetcher = createCaptionTransport(false).fetcher;
  let audio: HTMLAudioElement | null = null;
  let objectUrl = '';
  let request: AbortController | null = null;
  let generation = 0;

  const releaseAudio = () => {
    if (audio) {
      audio.onplay = null; audio.onended = null; audio.onerror = null; audio.onpause = null;
      audio.pause(); audio.src = '';
      audio = null;
    }
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = ''; }
  };

  const stop = async () => {
    generation++;
    request?.abort(); request = null;
    releaseAudio();
  };

  const speak = (text: string, options: PlaybackCallbacks) => {
    const current = ++generation;
    request?.abort();
    releaseAudio();
    request = new AbortController();
    void (async () => {
      try {
        if (!await ensureServiceConnection({ force: !serviceCredentials.current })) throw new Error('connection');
        const credential = serviceCredentials.current;
        if (!credential || current !== generation) return;
        const language = options.language.toLowerCase().startsWith('en') ? 'en' : 'ur';
        const response = await fetcher(`${serviceBaseUrl}/v1/tts`, {
          method: 'POST', redirect: 'error', cache: 'no-store', signal: request?.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credential.token}` },
          body: JSON.stringify({ text: text.trim(), language }),
        });
        if (!response.ok || current !== generation) throw new Error('tts');
        const blob = await response.blob();
        if (!blob.size || current !== generation) throw new Error('tts');
        objectUrl = URL.createObjectURL(blob);
        audio = new window.Audio(objectUrl);
        audio.onplay = () => { if (current === generation) options.onStart(); };
        audio.onended = () => { if (current === generation) options.onDone(); };
        audio.onerror = () => { if (current === generation) options.onError(); };
        await audio.play();
      } catch (error) {
        if (current !== generation || (error instanceof DOMException && error.name === 'AbortError')) return;
        options.onError(error);
      }
    })();
  };

  return { stop, speak };
}
