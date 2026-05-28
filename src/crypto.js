// 立花証券 v4r9 専用: 公開鍵暗号化された仮想URLの復号と認証情報の取り出し
//
// 暗号化方式: RSA-OAEP-SHA256（鍵長 2048bit または 4096bit）
// 公開鍵形式: PEM SPKI（-----BEGIN PUBLIC KEY-----）
// 暗号文エンコード: Base64（実機レスポンスで Hex 等が判明したら別途対応）
//
// 仕様根拠: 立花e支店APIデモ環境・利用設定画面の説明文（2026-05-24 確認）
//   ※公開キーは暗号化方式「RSA」、暗号化ビット数「2048」または「4096」で作成した値
//   ※暗号化アルゴリズムは「SHA-256」で処理します
//   → RSA + SHA-256 ハッシュ利用の組合せは OAEP のみ（PKCS1 v1.5 はハッシュ不使用）

import crypto from "node:crypto";

/**
 * 立花証券から返却される暗号化済み仮想URLを秘密鍵で復号する
 * @param {string} encrypted - Base64 エンコードされた RSA-OAEP-SHA256 暗号文
 * @param {string} privateKeyPem - 秘密鍵（PEM形式・登録した公開鍵と対のペア）
 * @returns {string} 復号後の平文仮想URL（"https://..." 形式）
 */
export function decryptVirtualUrl(encrypted, privateKeyPem) {
  if (!encrypted) {
    throw new Error("暗号化済み仮想URLが空です");
  }
  if (!privateKeyPem) {
    throw new Error("TACHIBANA_PRIVATE_KEY が設定されていません");
  }

  // Base64 → バイト列。Buffer.from は不正文字を黙って捨ててしまうので、
  // 「全文 Base64 として有効か」を厳密チェックしてから decode する
  // （Hex が来ていたら大半の文字が捨てられて短い不正バイト列になり、後段の復号でエラーになる）
  if (!/^[A-Za-z0-9+/=\s]+$/.test(encrypted)) {
    throw new Error(
      "暗号文が Base64 形式ではありません。立花レスポンスのエンコード形式（Hex 等の可能性）を確認してください"
    );
  }
  const ciphertext = Buffer.from(encrypted, "base64");

  let plaintext;
  try {
    plaintext = crypto.privateDecrypt(
      {
        key: privateKeyPem,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      ciphertext
    );
  } catch (e) {
    throw new Error(
      `仮想URLの復号に失敗しました（RSA-OAEP-SHA256）: ${e.message}。立花に登録した公開鍵と対の秘密鍵を使っているか、暗号文が改ざんされていないか確認してください`
    );
  }

  return plaintext.toString("utf-8");
}

// 立花の利用設定はデモと本番で別管理（v4r9 概要PDF）。認証ID/鍵もそれぞれ別物になるので
// demo フラグで読む環境変数を切り替える。フォールバックはしない（誤って本番鍵をデモに使う事故を防ぐ）
const AUTH_ID_ENV = { production: "TACHIBANA_AUTH_ID", demo: "TACHIBANA_AUTH_ID_DEMO" };
const PRIVATE_KEY_ENV = { production: "TACHIBANA_PRIVATE_KEY", demo: "TACHIBANA_PRIVATE_KEY_DEMO" };

/**
 * 認証IDを環境変数から取り出す
 * @param {boolean} [demo=false] - true なら TACHIBANA_AUTH_ID_DEMO、false なら TACHIBANA_AUTH_ID
 * @returns {string}
 */
export function getAuthId(demo = false) {
  const envName = demo ? AUTH_ID_ENV.demo : AUTH_ID_ENV.production;
  const raw = process.env[envName];
  if (!raw) {
    throw new Error(`${envName} が設定されていません`);
  }
  return raw;
}

/**
 * 秘密鍵を環境変数から取り出す（PEM形式の改行が \n エスケープされていることを許容）
 * 読み込んだ鍵は crypto.createPrivateKey でパース検証し、形式不正は早期に落とす。
 * @param {boolean} [demo=false] - true なら TACHIBANA_PRIVATE_KEY_DEMO、false なら TACHIBANA_PRIVATE_KEY
 * @returns {string} PEM形式の秘密鍵文字列（改行は実改行に戻し済み）
 */
export function getPrivateKey(demo = false) {
  const envName = demo ? PRIVATE_KEY_ENV.demo : PRIVATE_KEY_ENV.production;
  const raw = process.env[envName];
  if (!raw) {
    throw new Error(`${envName} が設定されていません`);
  }
  // Vercel環境変数は改行を \n でエスケープして格納されることが多いので戻す
  const pem = raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;

  // PEM パース検証: 5/30 にヒロシが鍵を貼り付ける時の形式ミスを早期検出する
  // よくある事故: 改行が消えてる、ヘッダ/フッタが欠落、Base64 部分の文字化け
  try {
    crypto.createPrivateKey(pem);
  } catch (e) {
    throw new Error(
      `${envName} の形式が不正です。PEM 形式（-----BEGIN PRIVATE KEY----- ... -----END PRIVATE KEY-----）の秘密鍵を設定してください。原因: ${e.message}`
    );
  }

  return pem;
}
