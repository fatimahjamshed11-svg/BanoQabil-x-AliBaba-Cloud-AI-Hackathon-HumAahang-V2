import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveServiceBaseUrl } from '../src/service-connection.ts';

test('an explicit service URL keeps precedence on web and native', () => {
  assert.equal(resolveServiceBaseUrl('https://api.example/'), 'https://api.example/');
  assert.equal(resolveServiceBaseUrl('https://api.example/', new URL('https://demo.example/transcription')), 'https://api.example/');
});

test('deployed HTTPS web uses its origin for the existing API and websocket clients', () => {
  assert.equal(resolveServiceBaseUrl(undefined, new URL('https://demo.example/transcription?language=ur')), 'https://demo.example');
  assert.equal(resolveServiceBaseUrl('', new URL('https://demo.example:8443/')), 'https://demo.example:8443');
});

test('native and Expo development keep localhost port 8787 while one-port loopback uses its origin', () => {
  assert.equal(resolveServiceBaseUrl(), 'http://127.0.0.1:8787');
  for (const page of ['http://localhost:8081', 'https://localhost:8081', 'http://127.0.0.1:8081',
    'https://127.0.0.2:8081', 'https://[::1]:8081', 'https://app.localhost:8081', 'http://192.168.1.10:8081']) {
    assert.equal(resolveServiceBaseUrl(undefined, new URL(page)), 'http://127.0.0.1:8787', page);
  }
  assert.equal(resolveServiceBaseUrl(undefined, new URL('http://127.0.0.1:8897/quick-speak')), 'http://127.0.0.1:8897');
});
