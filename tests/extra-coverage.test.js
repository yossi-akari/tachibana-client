// 振る舞い固定用の追加カバレッジ
// 「将来 v4r10 移行や crypto ライブラリ差し替え時に意図せず壊れる」のを防ぐ網

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getBaseUrl,
  getAuthUrl,
  formatTachibanaDate,
  fetchTachibanaApi,
  sendRequest,
} from '../src/index.js';

// テスト中だけ TACHIBANA_API_VERSION を差し替えるユーティリティ
async function withApiVersion(version, fn) {
  const original = process.env.TACHIBANA_API_VERSION;
  if (version === undefined) delete process.env.TACHIBANA_API_VERSION;
  else process.env.TACHIBANA_API_VERSION = version;
  try {
    return await fn();
  } finally {
    if (original === undefined) delete process.env.TACHIBANA_API_VERSION;
    else process.env.TACHIBANA_API_VERSION = original;
  }
}

describe('getBaseUrl / getAuthUrl: 本番・デモ・バージョンごとの URL 固定', () => {
  it('v4r8 本番 / デモの URL', async () => {
    await withApiVersion('v4r8', () => {
      expect(getBaseUrl(false)).toBe('https://kabuka.e-shiten.jp/e_api_v4r8/');
      expect(getBaseUrl(true)).toBe('https://demo-kabuka.e-shiten.jp/e_api_v4r8/');
      expect(getAuthUrl(false)).toBe('https://kabuka.e-shiten.jp/e_api_v4r8/auth/');
      expect(getAuthUrl(true)).toBe('https://demo-kabuka.e-shiten.jp/e_api_v4r8/auth/');
    });
  });

  it('v4r9 本番 / デモの URL', async () => {
    await withApiVersion('v4r9', () => {
      expect(getBaseUrl(false)).toBe('https://kabuka.e-shiten.jp/e_api_v4r9/');
      expect(getBaseUrl(true)).toBe('https://demo-kabuka.e-shiten.jp/e_api_v4r9/');
      expect(getAuthUrl(false)).toBe('https://kabuka.e-shiten.jp/e_api_v4r9/auth/');
      expect(getAuthUrl(true)).toBe('https://demo-kabuka.e-shiten.jp/e_api_v4r9/auth/');
    });
  });

  it('デモフラグの有無で URL 本体が切り替わる', async () => {
    await withApiVersion('v4r8', () => {
      const prod = getBaseUrl(false);
      const demo = getBaseUrl(true);
      expect(prod).toContain('kabuka.e-shiten.jp');
      expect(demo).toContain('demo-kabuka.e-shiten.jp');
      expect(prod).not.toBe(demo);
    });
  });
});

describe('formatTachibanaDate: 実行環境 TZ に関係なく JST で出力', () => {
  it('UTC エポック 0 が JST 1970.01.01-09:00:00.000 になる', () => {
    // Date(0) = UTC エポック = JST では 1970-01-01 09:00:00
    const formatted = formatTachibanaDate(new Date(0));
    expect(formatted).toBe('1970.01.01-09:00:00.000');
  });

  it('ミリ秒もゼロ詰め 3 桁', () => {
    // 2026-05-24 05:55:55.497 UTC = 2026-05-24 14:55:55.497 JST
    const formatted = formatTachibanaDate(new Date('2026-05-24T05:55:55.497Z'));
    expect(formatted).toBe('2026.05.24-14:55:55.497');
  });

  it('ミリ秒が 1 桁の場合はゼロ詰め', () => {
    // Date(1) = 1970.01.01 00:00:00.001 UTC = 1970.01.01 09:00:00.001 JST
    const formatted = formatTachibanaDate(new Date(1));
    expect(formatted).toBe('1970.01.01-09:00:00.001');
  });

  it('月日時分秒もゼロ詰め 2 桁', () => {
    // 2026-01-01 00:00:00.000 UTC = 2026-01-01 09:00:00.000 JST
    const formatted = formatTachibanaDate(new Date('2026-01-01T00:00:00.000Z'));
    expect(formatted).toBe('2026.01.01-09:00:00.000');
  });
});

describe('fetchTachibanaApi: Shift-JIS デコード + mapResponseKeys 適用', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('HTTP 200 で JSON レスポンス（UTF-8）を名前付きキーに変換して返す', async () => {
    // シンプルな ASCII JSON で、デコード挙動を検証
    const body = Buffer.from(JSON.stringify({
      "287": "0",      // sResultCode
      "333": "CLMTest", // sCLMID
      "286": "Success", // sResultText
    }), 'utf8');

    globalThis.fetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    });

    const result = await fetchTachibanaApi('https://example.invalid/api', { sCLMID: 'CLMTest' });
    expect(result.sResultCode).toBe('0');
    expect(result.sCLMID).toBe('CLMTest');
    expect(result.sResultText).toBe('Success');
  });

  it('HTTP 404 で例外を投げる', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 404 });
    await expect(fetchTachibanaApi('https://x', {}))
      .rejects.toThrow('HTTP 404');
  });

  it('HTTP 500 で例外を投げる', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(fetchTachibanaApi('https://x', {}))
      .rejects.toThrow('HTTP 500');
  });

  it('fetch が POST メソッドで呼ばれる', async () => {
    const body = Buffer.from('{"287":"0"}', 'utf8');
    globalThis.fetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    });

    await fetchTachibanaApi('https://example.invalid/test', { sCLMID: 'Test' });

    const call = globalThis.fetch.mock.calls[0];
    expect(call[0]).toBe('https://example.invalid/test');
    expect(call[1].method).toBe('POST');
    expect(call[1].headers['Content-Type']).toBe('application/json');
  });

  it('requestBody が JSON.stringify されている', async () => {
    const body = Buffer.from('{"287":"0"}', 'utf8');
    globalThis.fetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    });

    await fetchTachibanaApi('https://x', { sCLMID: 'CLMTest', p_no: '123' });

    const sentBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(sentBody.sCLMID).toBe('CLMTest');
    expect(sentBody.p_no).toBe('123');
  });
});

describe('sendRequest: sResultCode 自動チェック', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sResultCode が "0" 以外なら例外を投げる', async () => {
    const body = Buffer.from(JSON.stringify({
      "287": "6",      // error code
      "286": "p_no error",
    }), 'utf8');

    globalThis.fetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    });

    await expect(sendRequest('https://x', { sCLMID: 'CLMTest' }))
      .rejects.toThrow(/p_no error/);
  });

  it('例外メッセージに code: XXXX を含む', async () => {
    const body = Buffer.from(JSON.stringify({
      "287": "99",
      "286": "Unknown error",
    }), 'utf8');

    globalThis.fetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    });

    await expect(sendRequest('https://x', {}))
      .rejects.toThrow(/code: 99/);
  });

  it('sResultCode が "0" なら正常に返す', async () => {
    const body = Buffer.from(JSON.stringify({
      "287": "0",
      "286": "Success",
      "333": "CLMTest",
    }), 'utf8');

    globalThis.fetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    });

    const result = await sendRequest('https://x', { sCLMID: 'CLMTest' });
    expect(result.sResultCode).toBe('0');
    expect(result.sResultText).toBe('Success');
  });

  it('p_no を自動付与する（数字形式）', async () => {
    const body = Buffer.from('{"287":"0"}', 'utf8');
    globalThis.fetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    });

    await sendRequest('https://x', { sCLMID: 'CLMTest' });

    const calledBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(calledBody.p_no).toMatch(/^\d+$/);
  });

  it('p_sd_date を自動付与する（YYYY.MM.DD-HH:mm:ss.SSS 形式）', async () => {
    const body = Buffer.from('{"287":"0"}', 'utf8');
    globalThis.fetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    });

    await sendRequest('https://x', { sCLMID: 'CLMTest' });

    const calledBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(calledBody.p_sd_date).toMatch(/^\d{4}\.\d{2}\.\d{2}-\d{2}:\d{2}:\d{2}\.\d{3}$/);
  });

  it('params 側で p_no を明示指定すれば自動付与を上書きする', async () => {
    const body = Buffer.from('{"287":"0"}', 'utf8');
    globalThis.fetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    });

    await sendRequest('https://x', { sCLMID: 'CLMTest', p_no: '999' });

    const calledBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(calledBody.p_no).toBe('999');
  });

  it('params 側で p_sd_date を明示指定すれば自動付与を上書きする', async () => {
    const body = Buffer.from('{"287":"0"}', 'utf8');
    globalThis.fetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    });

    const customDate = '2026.05.24-14:55:55.497';
    await sendRequest('https://x', { sCLMID: 'CLMTest', p_sd_date: customDate });

    const calledBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(calledBody.p_sd_date).toBe(customDate);
  });

  it('sResultCode が undefined の場合は例外を投げない', async () => {
    const body = Buffer.from(JSON.stringify({
      "333": "CLMTest",
    }), 'utf8');

    globalThis.fetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    });

    const result = await sendRequest('https://x', {});
    expect(result.sCLMID).toBe('CLMTest');
  });
});
