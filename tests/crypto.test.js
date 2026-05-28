// 立花証券 v4r9 公開鍵暗号化方式の round-trip 検証 + decryptVirtualUrl 本実装テスト
//
// 仕様: RSA-OAEP-SHA256（2048/4096bit）、Base64 入力
// 仕様根拠: 立花e支店APIデモ環境・利用設定画面の説明文（2026-05-24 確認）
//
// 「立花の crypto API を直接叩いた round-trip」と「decryptVirtualUrl 経由の round-trip」
// の2層でテストすることで、立花仕様変更時にどちらのレイヤーで壊れたかを切り分けやすくしている。

import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';

// テスト全体で共有する 2048bit RSA 鍵ペア（生成コストが高いので beforeAll で1回だけ）
let keyPair;

beforeAll(() => {
  keyPair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
});

// 立花APIの仮想URLは "https://..." 形式のはず（v4r8 では平文URL）
const SAMPLE_VIRTUAL_URL = 'https://kabuka.e-shiten.jp/e_api_v4r9/sd_xxxxxxxxxxxxxxxxxxxxxx/request/';

describe('v4r9 公開鍵暗号化アルゴリズムの round-trip 検証', () => {
  it('RSA-OAEP-SHA256 で暗号化→復号して元の平文に戻る', () => {
    const ciphertext = crypto.publicEncrypt(
      {
        key: keyPair.publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(SAMPLE_VIRTUAL_URL, 'utf-8')
    );

    const plaintext = crypto.privateDecrypt(
      {
        key: keyPair.privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      ciphertext
    );

    expect(plaintext.toString('utf-8')).toBe(SAMPLE_VIRTUAL_URL);
  });

  it('RSA-OAEP-SHA1 で暗号化→復号して元の平文に戻る', () => {
    const ciphertext = crypto.publicEncrypt(
      {
        key: keyPair.publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha1',
      },
      Buffer.from(SAMPLE_VIRTUAL_URL, 'utf-8')
    );

    const plaintext = crypto.privateDecrypt(
      {
        key: keyPair.privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha1',
      },
      ciphertext
    );

    expect(plaintext.toString('utf-8')).toBe(SAMPLE_VIRTUAL_URL);
  });

  it('RSA-PKCS1 v1.5 で暗号化→復号して元の平文に戻る', () => {
    const ciphertext = crypto.publicEncrypt(
      {
        key: keyPair.publicKey,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      Buffer.from(SAMPLE_VIRTUAL_URL, 'utf-8')
    );

    const plaintext = crypto.privateDecrypt(
      {
        key: keyPair.privateKey,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      ciphertext
    );

    expect(plaintext.toString('utf-8')).toBe(SAMPLE_VIRTUAL_URL);
  });

  // 立花のレスポンスJSONは Base64 か Hex で来る可能性が高いので、両方の入力形式を検証
  it('Base64 エンコードされた暗号文を復号できる', () => {
    const ciphertext = crypto.publicEncrypt(
      {
        key: keyPair.publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(SAMPLE_VIRTUAL_URL, 'utf-8')
    );
    const ciphertextBase64 = ciphertext.toString('base64');

    const plaintext = crypto.privateDecrypt(
      {
        key: keyPair.privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(ciphertextBase64, 'base64')
    );

    expect(plaintext.toString('utf-8')).toBe(SAMPLE_VIRTUAL_URL);
  });

  it('Hex エンコードされた暗号文を復号できる', () => {
    const ciphertext = crypto.publicEncrypt(
      {
        key: keyPair.publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(SAMPLE_VIRTUAL_URL, 'utf-8')
    );
    const ciphertextHex = ciphertext.toString('hex');

    const plaintext = crypto.privateDecrypt(
      {
        key: keyPair.privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(ciphertextHex, 'hex')
    );

    expect(plaintext.toString('utf-8')).toBe(SAMPLE_VIRTUAL_URL);
  });

  it('間違った秘密鍵で復号すると例外が出る（鍵検証の確実性）', () => {
    const otherKeyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const ciphertext = crypto.publicEncrypt(
      {
        key: keyPair.publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(SAMPLE_VIRTUAL_URL, 'utf-8')
    );

    expect(() => {
      crypto.privateDecrypt(
        {
          key: otherKeyPair.privateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        ciphertext
      );
    }).toThrow();
  });
});

describe('decryptVirtualUrl: RSA-OAEP-SHA256 本実装', () => {
  // 立花の本番フロー（公開鍵で暗号化 → Base64 化 → 立花APIレスポンスとして返却）を再現
  function encryptAsTachibana(plaintext, publicKey) {
    const ciphertext = crypto.publicEncrypt(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(plaintext, 'utf-8')
    );
    return ciphertext.toString('base64');
  }

  it('立花APIレスポンス（Base64暗号文）を平文URLに復号できる', async () => {
    const { decryptVirtualUrl } = await import('../src/crypto.js');
    const encrypted = encryptAsTachibana(SAMPLE_VIRTUAL_URL, keyPair.publicKey);
    expect(decryptVirtualUrl(encrypted, keyPair.privateKey)).toBe(SAMPLE_VIRTUAL_URL);
  });

  it('4096bit 鍵でも復号できる（立花仕様は 2048/4096 両対応）', async () => {
    const { decryptVirtualUrl } = await import('../src/crypto.js');
    const bigKey = crypto.generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const encrypted = encryptAsTachibana(SAMPLE_VIRTUAL_URL, bigKey.publicKey);
    expect(decryptVirtualUrl(encrypted, bigKey.privateKey)).toBe(SAMPLE_VIRTUAL_URL);
  });

  it('暗号文が空文字なら例外を投げる', async () => {
    const { decryptVirtualUrl } = await import('../src/crypto.js');
    expect(() => decryptVirtualUrl('', keyPair.privateKey)).toThrow(/暗号化済み仮想URLが空/);
  });

  it('秘密鍵が空なら例外を投げる', async () => {
    const { decryptVirtualUrl } = await import('../src/crypto.js');
    const encrypted = encryptAsTachibana(SAMPLE_VIRTUAL_URL, keyPair.publicKey);
    expect(() => decryptVirtualUrl(encrypted, '')).toThrow(/TACHIBANA_PRIVATE_KEY/);
  });

  it('Base64 でない文字列（Hex等）を渡すと「Base64形式ではない」例外を投げる', async () => {
    const { decryptVirtualUrl } = await import('../src/crypto.js');
    // 16進文字だけだが '!' を混ぜて Base64 不正にする
    expect(() => decryptVirtualUrl('deadbeef!notbase64', keyPair.privateKey)).toThrow(
      /Base64 形式ではありません/
    );
  });

  it('ペア違いの秘密鍵で復号すると「復号に失敗」例外を投げる', async () => {
    const { decryptVirtualUrl } = await import('../src/crypto.js');
    const otherKey = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const encrypted = encryptAsTachibana(SAMPLE_VIRTUAL_URL, keyPair.publicKey);
    expect(() => decryptVirtualUrl(encrypted, otherKey.privateKey)).toThrow(
      /復号に失敗/
    );
  });

  it('改ざんされた Base64 暗号文で復号すると「復号に失敗」例外を投げる', async () => {
    const { decryptVirtualUrl } = await import('../src/crypto.js');
    const encrypted = encryptAsTachibana(SAMPLE_VIRTUAL_URL, keyPair.publicKey);
    // 真ん中の1文字を入れ替える（Base64 として有効だが復号は壊れる）
    const mid = Math.floor(encrypted.length / 2);
    const tampered = encrypted.slice(0, mid) + (encrypted[mid] === 'A' ? 'B' : 'A') + encrypted.slice(mid + 1);
    expect(() => decryptVirtualUrl(tampered, keyPair.privateKey)).toThrow(/復号に失敗/);
  });
});

// テスト中に書き換えた環境変数を毎回元に戻すためのユーティリティ
// async fn を必ず待ってから env を復元する（同期 finally だと Promise を待たずに env が戻り、
// テスト本体が実行される頃には書き換えが消えている事故が起きる）
async function withEnv(envs, fn) {
  const originals = {};
  for (const [k, v] of Object.entries(envs)) {
    originals[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(originals)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe('getPrivateKey: 環境変数からの鍵取り出し', () => {
  it('TACHIBANA_PRIVATE_KEY を読み、PEM 形式の鍵を返す', async () => {
    await withEnv({ TACHIBANA_PRIVATE_KEY: keyPair.privateKey }, async () => {
      const { getPrivateKey } = await import('../src/crypto.js');
      expect(getPrivateKey()).toBe(keyPair.privateKey);
    });
  });

  it('Vercel流の \\n エスケープ済みPEMを実改行に戻して返す', async () => {
    const escaped = keyPair.privateKey.replace(/\n/g, '\\n');
    await withEnv({ TACHIBANA_PRIVATE_KEY: escaped }, async () => {
      const { getPrivateKey } = await import('../src/crypto.js');
      expect(getPrivateKey()).toBe(keyPair.privateKey);
    });
  });

  it('環境変数未設定なら例外を投げる', async () => {
    await withEnv({ TACHIBANA_PRIVATE_KEY: undefined }, async () => {
      const { getPrivateKey } = await import('../src/crypto.js');
      expect(() => getPrivateKey()).toThrow(/TACHIBANA_PRIVATE_KEY/);
    });
  });

  it('PEM形式が壊れていれば例外を投げる（5/30 の鍵貼り付けミスを早期検出）', async () => {
    // 改行が消えてしまったPEM（よくある事故: 環境変数登録時のコピペ崩れ）
    const broken = '-----BEGIN PRIVATE KEY-----ABCDEF-----END PRIVATE KEY-----';
    await withEnv({ TACHIBANA_PRIVATE_KEY: broken }, async () => {
      const { getPrivateKey } = await import('../src/crypto.js');
      expect(() => getPrivateKey()).toThrow(/形式が不正/);
    });
  });

  it('完全に無関係な文字列でも例外を投げる', async () => {
    await withEnv({ TACHIBANA_PRIVATE_KEY: 'hello world' }, async () => {
      const { getPrivateKey } = await import('../src/crypto.js');
      expect(() => getPrivateKey()).toThrow(/形式が不正/);
    });
  });

  it('demo=true なら TACHIBANA_PRIVATE_KEY_DEMO を読む', async () => {
    const demoKey = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    }).privateKey;

    await withEnv(
      {
        TACHIBANA_PRIVATE_KEY: keyPair.privateKey,
        TACHIBANA_PRIVATE_KEY_DEMO: demoKey,
      },
      async () => {
        const { getPrivateKey } = await import('../src/crypto.js');
        expect(getPrivateKey(true)).toBe(demoKey);
        expect(getPrivateKey(false)).toBe(keyPair.privateKey);
      }
    );
  });

  it('demo=true で TACHIBANA_PRIVATE_KEY_DEMO が未設定なら、本番鍵にフォールバックせず例外を投げる', async () => {
    await withEnv(
      {
        TACHIBANA_PRIVATE_KEY: keyPair.privateKey, // 本番鍵はある
        TACHIBANA_PRIVATE_KEY_DEMO: undefined, // デモ鍵はない
      },
      async () => {
        const { getPrivateKey } = await import('../src/crypto.js');
        expect(() => getPrivateKey(true)).toThrow(/TACHIBANA_PRIVATE_KEY_DEMO/);
      }
    );
  });
});

describe('getAuthId: 環境変数からの認証ID取り出し', () => {
  it('TACHIBANA_AUTH_ID をそのまま返す', async () => {
    await withEnv({ TACHIBANA_AUTH_ID: 'auth-id-xxxxxxxxxxxx' }, async () => {
      const { getAuthId } = await import('../src/crypto.js');
      expect(getAuthId()).toBe('auth-id-xxxxxxxxxxxx');
    });
  });

  it('環境変数未設定なら例外を投げる', async () => {
    await withEnv({ TACHIBANA_AUTH_ID: undefined }, async () => {
      const { getAuthId } = await import('../src/crypto.js');
      expect(() => getAuthId()).toThrow(/TACHIBANA_AUTH_ID/);
    });
  });

  it('demo=true なら TACHIBANA_AUTH_ID_DEMO を読む', async () => {
    await withEnv(
      {
        TACHIBANA_AUTH_ID: 'prod-auth-id',
        TACHIBANA_AUTH_ID_DEMO: 'demo-auth-id',
      },
      async () => {
        const { getAuthId } = await import('../src/crypto.js');
        expect(getAuthId(true)).toBe('demo-auth-id');
        expect(getAuthId(false)).toBe('prod-auth-id');
      }
    );
  });

  it('demo=true で TACHIBANA_AUTH_ID_DEMO が未設定なら、本番IDにフォールバックせず例外を投げる', async () => {
    await withEnv(
      {
        TACHIBANA_AUTH_ID: 'prod-auth-id',
        TACHIBANA_AUTH_ID_DEMO: undefined,
      },
      async () => {
        const { getAuthId } = await import('../src/crypto.js');
        expect(() => getAuthId(true)).toThrow(/TACHIBANA_AUTH_ID_DEMO/);
      }
    );
  });
});
