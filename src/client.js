// 立花証券 e支店 API クライアント
// セッション（仮想URL群）の暗号化/復号とAPI通信を担当

import crypto from "node:crypto";

// APIバージョンのベースURL（v4r9移行時はここを変更するだけ）
const API_VERSIONS = {
  v4r8: {
    production: "https://kabuka.e-shiten.jp/e_api_v4r8/",
    demo: "https://demo-kabuka.e-shiten.jp/e_api_v4r8/",
  },
  v4r9: {
    production: "https://kabuka.e-shiten.jp/e_api_v4r9/",
    demo: "https://demo-kabuka.e-shiten.jp/e_api_v4r9/",
  },
};

// 現在使用するAPIバージョン
// 環境変数 TACHIBANA_API_VERSION で切替可能（"v4r8" | "v4r9"）。
// 未設定時は v4r8（既存挙動）。5/16のv4r9リリース後に Vercel 環境変数で "v4r9" に切替える。
export function getCurrentVersion() {
  const v = process.env.TACHIBANA_API_VERSION;
  if (v === "v4r9" || v === "v4r8") return v;
  return "v4r8";
}

/**
 * 立花証券APIのベースURLを取得する
 * @param {boolean} demo - デモモードかどうか
 * @returns {string}
 */
export function getBaseUrl(demo = false) {
  const version = API_VERSIONS[getCurrentVersion()];
  return demo ? version.demo : version.production;
}

/**
 * 立花証券APIの認証URLを取得する
 * @param {boolean} demo - デモモードかどうか
 * @returns {string}
 */
export function getAuthUrl(demo = false) {
  return `${getBaseUrl(demo)}auth/`;
}

/**
 * 立花証券API用の日時文字列を生成する（常にJSTで出力）
 * フォーマット: "YYYY.MM.DD-HH:mm:ss.SSS"
 * 立花証券APIサーバーはJST稼働。Vercel ServerlessはUTC稼働なので、
 * 動作環境のタイムゾーンに依存せずJST(+9h)に変換してから整形する。
 * サーバー時刻と30秒以上ずれるとエラーになるので、リクエスト直前に呼ぶこと
 * @param {Date} [date] - 省略時は現在時刻
 * @returns {string}
 */
export function formatTachibanaDate(date = new Date()) {
  // UTCエポックに+9時間してJSTに合わせ、getUTC系で取り出すことで
  // 実行環境のタイムゾーンに依存せず必ずJSTの値が得られる
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const mo = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(jst.getUTCDate()).padStart(2, "0");
  const h = String(jst.getUTCHours()).padStart(2, "0");
  const mi = String(jst.getUTCMinutes()).padStart(2, "0");
  const s = String(jst.getUTCSeconds()).padStart(2, "0");
  const ms = String(jst.getUTCMilliseconds()).padStart(3, "0");
  return `${y}.${mo}.${d}-${h}:${mi}:${s}.${ms}`;
}

// --- レスポンスの数値キー → 名前付きキー変換 ---

// 立花証券APIのレスポンスはキーが数値ID（例: "287"）で返ってくる
// 既知のIDのみ名前付きキーに変換する。未知のキーはそのまま残す
// 各エンドポイント（残高/注文一覧/注文）のテストが進むたびにここへ追加する
//
// 重要: v4r8 と v4r9 で仮想URL関連のキー番号がシフトしている。
//   - v4r8: 868-872 が sUrlEvent/sUrlEventWs/sUrlMaster/sUrlPrice/sUrlRequest
//   - v4r9: 869-873 が sUrlEvent/sUrlEventWebSocket/sUrlMaster/sUrlPrice/sUrlRequest
//          （868 は廃止、873 が新規追加。WebSocket版イベントURL名は公式表記に合わせて sUrlEventWebSocket）
// この対応は v4r9 デモ環境の生レスポンス（2026-05-24 取得）から判明。
const RESPONSE_KEY_MAP = {
  // 共通フィールド（v4r8/v4r9 で同一）
  "286": "sResultText",
  "287": "sResultCode",
  "288": "p_no",
  "289": "sRequestTime",
  "290": "sResponseTime",
  "333": "sCLMID",  // v4r9 デモで確認。"334" だった可能性は否定できないが、リクエスト送信側でしか使われていないので影響なし
  // ログインレスポンス（CLMAuthLoginAck）— v4r8 ベース
  "868": "sUrlEvent",
  "869": "sUrlEventWs",
  "870": "sUrlMaster",
  "871": "sUrlPrice",
  "872": "sUrlRequest",
  // 残高照会レスポンス（CLMGenbutuKabuList）- 配列ラッパー
  "88": "aGenbutuKabuList",
  // 残高照会レスポンス - 各保有株の項目
  "854": "sAveragePrice",      // 平均取得単価（小数4桁）
  "855": "sProfitLoss",        // 評価損益額
  "856": "sProfitLossRate",    // 評価損益率%
  "857": "sMarketValue",       // 評価額
  "858": "sCurrentPrice",      // 現在値（小数4桁）
  "859": "sIssueCode",         // 銘柄コード
  "863": "sBalanceQuantity",   // 保有数量
  // 注: 残高照会レスポンスには銘柄名(sIssueName)が含まれない
  // 銘柄名が必要な場合は sUrlMaster で別途マスター取得が必要
  // OHLC履歴レスポンス（CLMMfdsGetMarketPriceHistory）- 2026-04-30 実機確認
  // 立花は分割未調整値と分割調整済み値を両方返してくる。チャート分析には調整済み値を使う
  "72":  "aPriceHistory",      // OHLCバー配列のラッパー
  "473": "sIssueCodeRes",      // レスポンス内の銘柄コード（"859"と区別）
  "106": "sHighPriceRaw",      // 高値（株式分割未調整）
  "107": "sHighPrice",         // 高値（分割調整済み）★これを使う
  "110": "sLowPriceRaw",       // 安値（未調整）
  "111": "sLowPrice",          // 安値（調整済み）★
  "112": "sOpenPriceRaw",      // 始値（未調整）
  "113": "sOpenPrice",         // 始値（調整済み）★
  "115": "sClosePriceRaw",     // 終値（未調整）
  "116": "sClosePrice",        // 終値（調整済み）★
  "117": "sVolumeRaw",         // 出来高（未調整）
  "118": "sVolume",            // 出来高（調整済み）★
  "344": "sTradeDate",         // 取引日（YYYYMMDD）
};

// v4r9 のログイン応答は仮想URLキーが 1 つズレており（868 廃止、873 新規）、
// WebSocket版イベントURLが新規追加されている。v4r9 だけ上書きで対応する。
const RESPONSE_KEY_MAP_V4R9_OVERRIDES = {
  "868": undefined,              // v4r9 では使われない
  "869": "sUrlEvent",
  "870": "sUrlEventWebSocket",   // 公式表記に合わせる（v4r8 では sUrlEventWs だった）
  "871": "sUrlMaster",
  "872": "sUrlPrice",
  "873": "sUrlRequest",
};

/**
 * 現在のAPIバージョンに合わせたレスポンスキーマップを返す
 * @returns {Record<string, string>}
 */
export function getResponseKeyMap() {
  if (getCurrentVersion() === "v4r9") {
    const merged = { ...RESPONSE_KEY_MAP, ...RESPONSE_KEY_MAP_V4R9_OVERRIDES };
    // value が undefined のキーは「v4r9 では使われない」印。削除して未知キー扱いにする
    for (const k of Object.keys(merged)) {
      if (merged[k] === undefined) delete merged[k];
    }
    return merged;
  }
  return RESPONSE_KEY_MAP;
}

/**
 * レスポンスの数値キーを名前付きキーに再帰的に変換する
 * 配列・ネストしたオブジェクトにも対応
 * @param {*} value - レスポンスの値（オブジェクト/配列/プリミティブ）
 * @param {Record<string, string>} [keyMap] - 使用するキーマップ。省略時は現在のAPIバージョンから決定
 * @returns {*}
 */
export function mapResponseKeys(value, keyMap = getResponseKeyMap()) {
  if (Array.isArray(value)) {
    return value.map((v) => mapResponseKeys(v, keyMap));
  }
  if (value && typeof value === "object") {
    const mapped = {};
    for (const [key, v] of Object.entries(value)) {
      const newKey = keyMap[key] ?? key;
      mapped[newKey] = mapResponseKeys(v, keyMap);
    }
    return mapped;
  }
  return value;
}

// --- セッション暗号化/復号 ---

const ALGORITHM = "aes-256-gcm";

/**
 * 環境変数から暗号化キーを取得する
 * @returns {Buffer}
 */
function getEncryptionKey() {
  const key = process.env.SESSION_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("SESSION_ENCRYPTION_KEY が設定されていません");
  }
  return Buffer.from(key, "hex");
}

/**
 * 仮想URL群をAES-256-GCMで暗号化してsessionIdを生成する
 * @param {object} sessionData - { sUrlRequest, sUrlMaster, sUrlPrice, sUrlEvent, demo }
 * @returns {string} 暗号化されたsessionId（Base64）
 */
export function encryptSession(sessionData) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const json = JSON.stringify(sessionData);
  let encrypted = cipher.update(json, "utf8", "base64");
  encrypted += cipher.final("base64");
  const tag = cipher.getAuthTag();

  // IV + AuthTag + 暗号文をまとめてBase64エンコード
  const combined = Buffer.concat([iv, tag, Buffer.from(encrypted, "base64")]);
  return combined.toString("base64url");
}

/**
 * sessionIdを復号して仮想URL群を取得する
 * @param {string} sessionId - 暗号化されたsessionId
 * @returns {object} { sUrlRequest, sUrlMaster, sUrlPrice, sUrlEvent, demo }
 */
export function decryptSession(sessionId) {
  const key = getEncryptionKey();
  const combined = Buffer.from(sessionId, "base64url");

  const iv = combined.subarray(0, 12);
  const tag = combined.subarray(12, 28);
  const encrypted = combined.subarray(28);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, undefined, "utf8");
  decrypted += decipher.final("utf8");

  return JSON.parse(decrypted);
}

/**
 * 立花証券APIにPOSTし、Shift-JIS→UTF-8変換と数値キー変換まで行う
 * sResultCodeのチェックはしないので、呼び出し側で判定すること（login.jsはエラー時に専用レスポンスを返したいため）
 * @param {string} url - 送信先URL
 * @param {object} params - リクエストボディ（sCLMID, p_no, p_sd_date等）
 * @returns {Promise<object>} 名前付きキーに変換済みのレスポンス
 */
export async function fetchTachibanaApi(url, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    throw new Error(`立花証券APIエラー: HTTP ${res.status}`);
  }

  // 立花証券のレスポンスはShift-JIS固定なのでArrayBufferで受けて変換する
  const buffer = await res.arrayBuffer();
  const text = new TextDecoder("shift_jis").decode(buffer);
  const raw = JSON.parse(text);

  return mapResponseKeys(raw);
}

/**
 * 立花証券APIにリクエストを送信する（sResultCode自動チェック付き）
 * 仮想URL経由の通常リクエストはこちらを使う
 * p_no と p_sd_date を自動付与する（呼び出し側でparamsに指定すれば上書き可能）
 * @param {string} url - 送信先URL（仮想URL）
 * @param {object} params - リクエストパラメータ（sCLMID等）
 * @returns {Promise<object>} レスポンスJSON
 */
export async function sendRequest(url, params) {
  // p_no, p_sd_date は立花証券APIのほぼ全エンドポイントで必須
  // params側で明示指定があればそれを優先する
  // p_no は仕様上「前回より大きい値」が必須（同じ値だとp_errno=6エラー）
  // ステートレスなServerlessではカウンタを持てないので、エポック秒で単調増加させる
  const fullParams = {
    p_no: String(Math.floor(Date.now() / 1000)),
    p_sd_date: formatTachibanaDate(),
    ...params,
  };

  const data = await fetchTachibanaApi(url, fullParams);

  // sResultCode が "0" でなければエラー
  if (data.sResultCode && data.sResultCode !== "0") {
    throw new Error(
      `立花証券APIエラー: ${data.sResultText || "不明なエラー"} (code: ${data.sResultCode})`
    );
  }

  return data;
}
