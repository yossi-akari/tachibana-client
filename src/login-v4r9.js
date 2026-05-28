// 立花証券 v4r9 ログインフロー
// 認証ID（環境変数）を送信 → 公開鍵暗号化された仮想URL群を受け取る → 秘密鍵で復号
//
// v4r9 では応答に sUrlEventWebSocket（WebSocket版イベントURL）が新規追加され、
// 全体のキー番号も 869〜873 に 1 つシフトしている（マッピングは tachibana-client.js）

import {
  getAuthUrl,
  fetchTachibanaApi,
  formatTachibanaDate,
} from "./client.js";
import { decryptVirtualUrl, getAuthId, getPrivateKey } from "./crypto.js";

/**
 * v4r9 のログインリクエストを実行し、仮想URL群を取得する
 * デモと本番で立花の利用設定は別管理なので、認証ID/秘密鍵もそれぞれ別の環境変数から取る
 * @param {object} args
 * @param {boolean} args.demo
 * @returns {Promise<{ ok: true, urls: object, systemStatus: string|null } | { ok: false, message: string }>}
 */
export async function loginV4r9({ demo }) {
  // 認証ID・秘密鍵の取得（demo フラグで読む環境変数が切り替わる）
  // 未設定や鍵の形式不正は例外で飛ぶので、まとめて ok:false に変換して返す
  let authId;
  let privateKey;
  try {
    authId = getAuthId(demo);
    privateKey = getPrivateKey(demo);
  } catch (e) {
    return { ok: false, message: e.message };
  }

  const authUrl = getAuthUrl(demo);

  const loginData = await fetchTachibanaApi(authUrl, {
    sCLMID: "CLMAuthLoginRequest",
    sAuthId: authId,
    p_no: "1",
    p_sd_date: formatTachibanaDate(),
  });

  if (loginData.sResultCode !== "0") {
    return {
      ok: false,
      message: `ログイン失敗: ${loginData.sResultText || "認証IDまたは公開鍵が無効"}`,
    };
  }

  // 各仮想URLは公開鍵で暗号化されているので秘密鍵で復号する
  const decrypt = (v) => (v ? decryptVirtualUrl(v, privateKey) : v);

  return {
    ok: true,
    urls: {
      sUrlRequest: decrypt(loginData.sUrlRequest),
      sUrlMaster: decrypt(loginData.sUrlMaster),
      sUrlPrice: decrypt(loginData.sUrlPrice),
      sUrlEvent: decrypt(loginData.sUrlEvent),
      sUrlEventWebSocket: decrypt(loginData.sUrlEventWebSocket),
    },
    systemStatus: loginData.sSystemState || null,
  };
}
