// 立花証券APIクライアント: レスポンスキー変換テーブル（v4r8/v4r9 差分）の検証
//
// 2026-05-24 のデモ環境疎通で「v4r9 では仮想URLのキー番号が 869〜873 にシフトしている」
// ことが判明し、v4r8 用と v4r9 用でキーマップを分ける構造に変更した。
// このテストはバージョン切替時にマップが正しく切り替わることを保証する。

import { describe, it, expect } from 'vitest';
import { getResponseKeyMap, mapResponseKeys } from '../src/client.js';

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

describe('getResponseKeyMap: v4r8/v4r9 バージョン分岐', () => {
  it('v4r8 では従来通り 868-872 が仮想URLにマップされる', async () => {
    await withApiVersion('v4r8', () => {
      const map = getResponseKeyMap();
      expect(map['868']).toBe('sUrlEvent');
      expect(map['869']).toBe('sUrlEventWs');
      expect(map['870']).toBe('sUrlMaster');
      expect(map['871']).toBe('sUrlPrice');
      expect(map['872']).toBe('sUrlRequest');
      // v4r9 で新規追加されたキーは v4r8 では未マップ
      expect(map['873']).toBeUndefined();
    });
  });

  it('v4r9 では 869-873 が仮想URLにマップされる（1つシフト + sUrlEventWebSocket 追加）', async () => {
    await withApiVersion('v4r9', () => {
      const map = getResponseKeyMap();
      // 868 は v4r9 では使われない（削除されている）
      expect(map['868']).toBeUndefined();
      expect(map['869']).toBe('sUrlEvent');
      expect(map['870']).toBe('sUrlEventWebSocket');
      expect(map['871']).toBe('sUrlMaster');
      expect(map['872']).toBe('sUrlPrice');
      expect(map['873']).toBe('sUrlRequest');
    });
  });

  it('TACHIBANA_API_VERSION 未設定なら v4r8 にフォールバック（既存挙動互換）', async () => {
    await withApiVersion(undefined, () => {
      const map = getResponseKeyMap();
      expect(map['868']).toBe('sUrlEvent');
      expect(map['872']).toBe('sUrlRequest');
      expect(map['873']).toBeUndefined();
    });
  });

  it('v4r9 では 343 が取引日（sTradeDate）にマップされる（344ではない）', async () => {
    // 2026-07-07 デモ環境の実機確認: CLMMfdsGetMarketPriceHistory の
    // 取引日キーは v4r9 だと 343 で返ってくる。344 のままだと sTradeDate が
    // 常に undefined になり、日足が全銘柄で0本になる（kizashi起動時に発覚）
    await withApiVersion('v4r9', () => {
      const map = getResponseKeyMap();
      expect(map['343']).toBe('sTradeDate');
    });
  });

  it('v4r8 では従来通り 344 が取引日（sTradeDate）にマップされる', async () => {
    await withApiVersion('v4r8', () => {
      const map = getResponseKeyMap();
      expect(map['344']).toBe('sTradeDate');
    });
  });

  it('共通フィールド（sResultCode 等）はバージョン非依存', async () => {
    const checkCommon = (map) => {
      expect(map['286']).toBe('sResultText');
      expect(map['287']).toBe('sResultCode');
      expect(map['288']).toBe('p_no');
      expect(map['289']).toBe('sRequestTime');
      expect(map['290']).toBe('sResponseTime');
      expect(map['333']).toBe('sCLMID');
    };
    await withApiVersion('v4r8', () => checkCommon(getResponseKeyMap()));
    await withApiVersion('v4r9', () => checkCommon(getResponseKeyMap()));
  });
});

describe('mapResponseKeys: ログイン応答の現実形を変換', () => {
  // 立花の生レスポンス（数値キー）を模擬。値は実際の暗号文ではなく識別用の文字列
  const rawLoginResponseV4r9 = {
    '286': '',
    '287': '0',
    '288': '1',
    '289': '2026.05.24-14:55:55.497',
    '290': '2026.05.24-14:55:55.794',
    '333': 'CLMAuthLoginAck',
    '869': '<encrypted-event-url>',
    '870': '<encrypted-event-ws-url>',
    '871': '<encrypted-master-url>',
    '872': '<encrypted-price-url>',
    '873': '<encrypted-request-url>',
  };

  it('v4r9 のログイン応答を変換すると sUrlEvent/sUrlEventWebSocket/sUrlMaster/sUrlPrice/sUrlRequest が揃う', async () => {
    await withApiVersion('v4r9', () => {
      const mapped = mapResponseKeys(rawLoginResponseV4r9);
      expect(mapped.sResultCode).toBe('0');
      expect(mapped.sCLMID).toBe('CLMAuthLoginAck');
      expect(mapped.sUrlEvent).toBe('<encrypted-event-url>');
      expect(mapped.sUrlEventWebSocket).toBe('<encrypted-event-ws-url>');
      expect(mapped.sUrlMaster).toBe('<encrypted-master-url>');
      expect(mapped.sUrlPrice).toBe('<encrypted-price-url>');
      expect(mapped.sUrlRequest).toBe('<encrypted-request-url>');
    });
  });

  it('v4r8 のログイン応答（868-872）も変換できる', async () => {
    const rawLoginResponseV4r8 = {
      '287': '0',
      '333': 'CLMAuthLoginAck',
      '868': 'event-url',
      '869': 'event-ws-url',
      '870': 'master-url',
      '871': 'price-url',
      '872': 'request-url',
    };
    await withApiVersion('v4r8', () => {
      const mapped = mapResponseKeys(rawLoginResponseV4r8);
      expect(mapped.sUrlEvent).toBe('event-url');
      expect(mapped.sUrlEventWs).toBe('event-ws-url');
      expect(mapped.sUrlMaster).toBe('master-url');
      expect(mapped.sUrlPrice).toBe('price-url');
      expect(mapped.sUrlRequest).toBe('request-url');
    });
  });

  it('未知のキーはそのまま残る（既知のキーだけ変換）', async () => {
    await withApiVersion('v4r9', () => {
      const mapped = mapResponseKeys({ '287': '0', '99999': 'unknown' });
      expect(mapped.sResultCode).toBe('0');
      expect(mapped['99999']).toBe('unknown');
    });
  });

  it('配列・ネストオブジェクトも再帰的に変換される', async () => {
    await withApiVersion('v4r9', () => {
      const input = {
        '88': [
          { '859': '7203', '858': '2500' },
          { '859': '9984', '858': '5000' },
        ],
      };
      const mapped = mapResponseKeys(input);
      expect(mapped.aGenbutuKabuList).toHaveLength(2);
      expect(mapped.aGenbutuKabuList[0].sIssueCode).toBe('7203');
      expect(mapped.aGenbutuKabuList[0].sCurrentPrice).toBe('2500');
      expect(mapped.aGenbutuKabuList[1].sIssueCode).toBe('9984');
    });
  });

  it('プリミティブ値はそのまま返す', async () => {
    await withApiVersion('v4r9', () => {
      expect(mapResponseKeys('hello')).toBe('hello');
      expect(mapResponseKeys(42)).toBe(42);
      expect(mapResponseKeys(null)).toBe(null);
    });
  });
});
