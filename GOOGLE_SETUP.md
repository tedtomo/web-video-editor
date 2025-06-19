# Googleスプレッドシート連携セットアップガイド

このガイドでは、Web動画エディターとGoogleスプレッドシートを連携するための設定手順を説明します。

## 🆕 簡単セットアップ（推奨）

設定ファイルを使用することで、毎回の入力を省略できます。

### 設定ファイルの作成

1. `config/google-config.example.json`をコピーして`config/google-config.json`を作成
2. 以下の情報を記入：
   - `spreadsheetId`: スプレッドシートのID
   - `credentials`: サービスアカウントのJSON（そのまま貼り付け）
   - `driveFolderId`: 保存先フォルダID（オプション）
   - `autoProcessEnabled`: `true`にすると起動時に自動処理開始
   - `autoProcessInterval`: 自動処理の間隔（分）

```bash
# 設定ファイルをコピー
cp config/google-config.example.json config/google-config.json

# 設定ファイルを編集
nano config/google-config.json
```

設定ファイルがあれば、Web UIで認証情報の入力が不要になります！

## 必要な準備

1. Google Cloud Platformアカウント
2. 編集権限のあるGoogleスプレッドシート
3. Google Driveの容量（生成した動画を保存するため）

## セットアップ手順

### 1. Google Cloud Projectの作成

1. [Google Cloud Console](https://console.cloud.google.com)にアクセス
2. 新しいプロジェクトを作成（または既存のプロジェクトを選択）
3. プロジェクト名をメモしておく

### 2. 必要なAPIを有効化

以下のAPIを有効化する必要があります：

1. **Google Sheets API**
   - ナビゲーションメニューから「APIとサービス」→「ライブラリ」を選択
   - 「Google Sheets API」を検索して有効化

2. **Google Drive API**
   - 同様に「Google Drive API」を検索して有効化

### 3. サービスアカウントの作成

1. 「APIとサービス」→「認証情報」を選択
2. 「認証情報を作成」→「サービスアカウント」を選択
3. サービスアカウント名を入力（例：`video-editor-service`）
4. 「作成して続行」をクリック
5. ロールで「編集者」を選択
6. 「完了」をクリック

### 4. 認証キーの取得

1. 作成したサービスアカウントをクリック
2. 「キー」タブを選択
3. 「鍵を追加」→「新しい鍵を作成」を選択
4. 「JSON」を選択して「作成」
5. ダウンロードされたJSONファイルを安全な場所に保存

### 5. スプレッドシートの準備

1. 以下の列を持つGoogleスプレッドシートを作成：

| 実行対象 | 画像 | 動画 | 音声 | 動画の長さ（秒） | 出力ファイル名 | 動画開始時間 | 音声開始時間 | 画像スケール（%） | フィルター色 | フィルター透明度（%） | 作成した動画 |
|---------|------|------|------|-----------------|---------------|-------------|-------------|-----------------|-------------|-------------------|-------------|
| ○ | [GoogleDriveリンク] | [GoogleDriveリンク] | [GoogleDriveリンク] | 20 | my_video.mp4 | 0:00 | 0:00 | 80 | #000000 | 0 | |

2. スプレッドシートのURLから、IDを取得
   - URL例：`https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit`
   - ID：`1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms`

### 6. 共有設定

1. サービスアカウントのメールアドレスをコピー
   - 認証情報ページでサービスアカウントをクリック
   - メールアドレスをコピー（例：`video-editor@project-id.iam.gserviceaccount.com`）

2. スプレッドシートを共有
   - スプレッドシートを開く
   - 「共有」ボタンをクリック
   - サービスアカウントのメールアドレスを入力
   - 「編集者」権限を付与

3. Google Driveフォルダを共有（オプション）
   - 動画を保存するフォルダを作成
   - 同様にサービスアカウントに編集権限を付与

## 使用方法

### Web UIからの使用

1. ブラウザで動画エディターを開く
2. ナビゲーションの「スプレッドシート連携」をクリック
3. 以下の情報を入力：
   - **スプレッドシートID**：上記で取得したID
   - **認証情報**：ダウンロードしたJSONファイルの内容をコピー＆ペースト
   - **保存先フォルダID**：（オプション）Google DriveフォルダのID
   - **処理範囲**：デフォルトは`A:L`

4. 処理オプションを選択：
   - **一度だけ実行**：現在の実行対象を処理
   - **定期実行**：指定した間隔で自動的に処理

5. 「処理を開始」をクリック

### APIからの使用

```bash
# 一度だけ実行
curl -X POST http://localhost:3003/api/spreadsheet-sync \
  -H "Content-Type: application/json" \
  -d '{
    "spreadsheetId": "YOUR_SPREADSHEET_ID",
    "credentials": { ... },
    "driveFolderId": "OPTIONAL_FOLDER_ID"
  }'

# 定期実行（5分ごと）
curl -X POST http://localhost:3003/api/spreadsheet-sync/start-periodic \
  -H "Content-Type: application/json" \
  -d '{
    "spreadsheetId": "YOUR_SPREADSHEET_ID",
    "credentials": { ... },
    "intervalMinutes": 5
  }'
```

## ファイルフォーマット

### 入力ファイル（Google Drive）

- **画像**：JPG, PNG, GIF, WebP
- **動画**：MP4, MOV, AVI, WebM
- **音声**：MP3, WAV, AAC, M4A

### 出力ファイル

- フォーマット：MP4 (H.264 + AAC)
- 解像度：元の動画と同じ
- フレームレート：元の動画と同じ

## トラブルシューティング

### よくある問題

1. **「認証エラー」が表示される**
   - サービスアカウントのメールアドレスがスプレッドシートに共有されているか確認
   - 認証情報のJSONが正しくコピーされているか確認

2. **「ファイルが見つかりません」エラー**
   - Google DriveのURLが正しいか確認
   - ファイルがサービスアカウントと共有されているか確認

3. **処理が遅い**
   - 大きなファイルの処理には時間がかかります
   - ネットワーク速度を確認してください

## セキュリティに関する注意

- 認証情報のJSONファイルは秘密情報です。第三者と共有しないでください
- 本番環境では、環境変数を使用して認証情報を管理することを推奨します
- 定期的にサービスアカウントのキーをローテーションしてください