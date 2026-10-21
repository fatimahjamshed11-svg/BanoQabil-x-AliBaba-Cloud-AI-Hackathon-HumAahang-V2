# ElevenLabs ML Lab

This worktree is for experimenting with ElevenLabs without changing the judge-ready stable release.

## Current boundary

- Stable release: `HumAahang-Judge-Ready-V2` on `main` and tag `v1.0-judge-ready`.
- Lab branch: `ml-lab` in this worktree.
- ElevenLabs is not enabled in the runtime yet.
- OpenAI remains the active provider until the ElevenLabs realtime adapter passes contract and provider tests.

## Planned provider split

- OpenAI: Vision and PSL Sign Assistance.
- ElevenLabs: realtime speech recognition and TTS experiments.
- Text translation remains unchanged until a tested ElevenLabs-compatible translation path is confirmed.

## ElevenLabs settings

The private `server/.env` may contain `ELEVENLABS_API_KEY`, `ELEVENLABS_STT_MODEL=scribe_v2_realtime`, and `ELEVENLABS_TTS_MODEL=eleven_v4`. This file is ignored and must never be committed.

For Urdu recognition, the adapter must send an explicit `language_code=urd`. Automatic detection is not reliable enough for the app’s Urdu-first flow.

## Safety rule

Do not merge or push lab changes to `main` until the full frontend and backend suites pass, realtime Urdu tests pass, and the stable UI behavior is rechecked.
