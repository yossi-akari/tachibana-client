// バレル src/index.js が公開 API を全部 re-export していることを検証
// これが落ちたら：新規公開関数を追加した際に index.js への追加忘れ
import { describe, it, expect } from 'vitest';
import * as pkg from '../src/index.js';

const EXPECTED_EXPORTS = [
  'getCurrentVersion',
  'getBaseUrl',
  'getAuthUrl',
  'formatTachibanaDate',
  'getResponseKeyMap',
  'mapResponseKeys',
  'encryptSession',
  'decryptSession',
  'fetchTachibanaApi',
  'sendRequest',
  'loginV4r8',
  'loginV4r9',
  'decryptVirtualUrl',
  'getAuthId',
  'getPrivateKey',
];

describe('tachibana-client バレル export', () => {
  it.each(EXPECTED_EXPORTS)('%s が export されている', (name) => {
    expect(pkg[name]).toBeTypeOf('function');
  });

  it('意図しない export が増えていない（package.json の Major bump 漏れ防止）', () => {
    const actual = Object.keys(pkg).sort();
    expect(actual).toEqual([...EXPECTED_EXPORTS].sort());
  });
});
