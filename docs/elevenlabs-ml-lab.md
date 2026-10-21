# ElevenLabs ML Lab

This worktree is for experimenting with ElevenLabs without changing the judge-ready stable release.

## Current boundary

- Stable release: `HumAahang-Judge-Ready-V2` on `main` and tag `v1.0-judge-ready`.
- Lab branch: `ml-lab` in this worktree.
- ElevenLabs realtime STT and browser TTS are enabled in this lab runtime only.
- OpenAI remains the active provider for Vision and text translation.

## Planned provider split

- OpenAI: Vision and PSL Sign Assistance.
- ElevenLabs: realtime speech recognition and Urdu/English TTS.
- Text translation remains unchanged until a tested ElevenLabs-compatible translation path is confirmed.

## ElevenLabs settings

The private `server/.env` contains the local `ELEVENLABS_API_KEY`, `ELEVENLABS_STT_MODEL=scribe_v2_realtime`, `ELEVENLABS_TTS_MODEL=eleven_v4`, and the tested Urdu voice ID. This file is ignored and must never be committed.

For Urdu recognition, the adapter must send an explicit `language_code=urd`. Automatic detection is not reliable enough for the app’s Urdu-first flow.

## Safety rule

The current lab milestone passes 163 backend tests, 189 frontend tests, a real Urdu STT smoke test, a real Urdu TTS route smoke test, and browser Quick Speak playback. Do not merge lab changes to `main` until the stable UI behavior is rechecked with the new provider split.
