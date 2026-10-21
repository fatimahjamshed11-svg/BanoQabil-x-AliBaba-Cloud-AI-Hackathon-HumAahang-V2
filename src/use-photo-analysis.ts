import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Speech from 'expo-speech';
import { createCaptionTransport } from './caption-transport';
import { serviceBaseUrl, serviceCredentials } from './service-connection';
import { ensureServiceConnection } from './service-bootstrap';
import { createVisionClient, getPslResultPresentation, idleVision, type VisionLanguage, type VisionPhoto, type VisionTask } from './vision-client';
import { createPhrasePlayback, idlePlayback, speechTextForLanguage } from './quick-speak-model';
import { createElevenLabsWebPlayback } from './elevenlabs-web-playback';

export function usePhotoAnalysis() {
  const [state, setState] = useState(idleVision), [playback, setPlayback] = useState(idlePlayback);
  const client = useRef<ReturnType<typeof createVisionClient> | null>(null);
  const player = useRef<ReturnType<typeof createPhrasePlayback> | null>(null);
  const cancel = useCallback(() => { client.current?.cancel(); player.current?.stop(); }, []);
  useEffect(() => {
    const analysis = createVisionClient({ baseUrl: serviceBaseUrl, credentials: serviceCredentials,
      fetcher: createCaptionTransport(Platform.OS !== 'web').fetcher, onState: setState });
    const speech = createPhrasePlayback(Platform.OS === 'web' ? (createElevenLabsWebPlayback() ?? Speech) : Speech, setPlayback);
    client.current = analysis; player.current = speech;
    void ensureServiceConnection();
    void Speech.getAvailableVoicesAsync().catch(() => {});
    const subscription = AppState.addEventListener('change', status => { if (status !== 'active') cancel(); });
    const hidden = () => { if (document.visibilityState !== 'visible') cancel(); };
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', hidden);
    return () => {
      subscription.remove(); if (Platform.OS === 'web') document.removeEventListener('visibilitychange', hidden);
      analysis.dispose(); speech.dispose(); client.current = null; player.current = null;
    };
  }, [cancel]);
  useFocusEffect(useCallback(() => () => cancel(), [cancel]));
  return { ...state, playback, cancel,
    analyze: useCallback(async (photo: VisionPhoto, language: VisionLanguage, task: VisionTask, autoSpeak: boolean) => {
      player.current?.stop();
      if (!await ensureServiceConnection()) return;
      const result = await client.current?.analyze(photo, language, task);
      if (result && client.current?.getState().result === result && autoSpeak) {
        const output = getPslResultPresentation(result, language);
        void player.current?.speak(output.displayText, speechTextForLanguage(output.displayText, output.spokenText, language), language);
      }
    }, []),
    translate: useCallback(async (language: VisionLanguage, autoSpeak: boolean) => {
      player.current?.stop();
      if (!await ensureServiceConnection()) return;
      let result = await client.current?.translate(language);
      // A server restart invalidates in-memory grants. Re-bootstrap once only for that auth failure.
      if (!result && client.current?.getState().needsConnection && await ensureServiceConnection({ force: true })) {
        result = await client.current?.translate(language);
      }
      if (result && client.current?.getState().result === result && autoSpeak) {
        const output = getPslResultPresentation(result, language);
        void player.current?.speak(output.displayText, speechTextForLanguage(output.displayText, output.spokenText, language), language);
      }
    }, []),
    cancelTranslation: useCallback(() => { client.current?.cancelTranslation(); player.current?.stop(); }, []),
    speak: useCallback(() => {
      const current = client.current?.getState();
      if (current?.phase === 'ready' && current.result) {
        const output = getPslResultPresentation(current.result, current.language ?? 'en');
        const selectedLanguage = current.language ?? 'en';
        void player.current?.speak(output.displayText, speechTextForLanguage(output.displayText, output.spokenText, selectedLanguage), selectedLanguage);
      }
    }, []),
    stopSpeaking: useCallback(() => player.current?.stop(), []),
  };
}
