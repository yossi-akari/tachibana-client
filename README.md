# tachibana-client

立花証券 e支店 API クライアント。kabura / aimee / shun の共通基盤。

## インストール（利用側）

```bash
npm install git+https://github.com/yossi-akari/tachibana-client.git#v0.1.0
```

## 使い方

```js
import {
  loginV4r9,
  sendRequest,
  encryptSession,
  decryptSession,
} from "tachibana-client";
```

## 公開 API

- `getCurrentVersion()` / `getBaseUrl(demo)` / `getAuthUrl(demo)` ─ 接続先制御
- `formatTachibanaDate(date)` ─ JST 形式の日時文字列
- `getResponseKeyMap()` / `mapResponseKeys(value)` ─ 数値キー → 名前付きキー変換
- `encryptSession(data)` / `decryptSession(sessionId)` ─ 仮想URL群の AES-256-GCM 暗号化
- `fetchTachibanaApi(url, params)` ─ Shift-JIS デコード込みの低レベル POST
- `sendRequest(url, params)` ─ sResultCode 自動チェック付き
- `loginV4r8(authId)` / `loginV4r9(authId, privateKeyPem)` ─ ログインフロー
- `decryptVirtualUrl(encryptedUrl, privateKeyPem)` ─ RSA-OAEP 復号

## 環境変数（利用側 .env で設定）

| 変数 | 用途 |
|---|---|
| `TACHIBANA_API_VERSION` | "v4r8" | "v4r9"（未設定なら v4r8） |
| `SESSION_ENCRYPTION_KEY` | AES-256-GCM 用 64文字 hex |
| `TACHIBANA_AUTH_ID` / `TACHIBANA_PRIVATE_KEY` | v4r9 本番 |
| `TACHIBANA_AUTH_ID_DEMO` / `TACHIBANA_PRIVATE_KEY_DEMO` | v4r9 デモ |

## 開発

```bash
npm install
npm test
```
