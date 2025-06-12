# Web Video Editor

社内向け動画編集ツール。画像・動画・音声を合成して新しい動画を作成します。

## 🚀 Renderへのデプロイ手順

### 1. GitHubリポジトリ作成

```bash
# リポジトリ初期化
git init
git add .
git commit -m "Initial commit"

# GitHubで新しいリポジトリを作成後
git remote add origin https://github.com/YOUR_USERNAME/web-video-editor.git
git branch -M main
git push -u origin main
```

### 2. Renderでデプロイ

1. [Render](https://render.com) にサインアップ/ログイン
2. **New +** → **Web Service** をクリック
3. GitHubリポジトリを接続
4. 以下を設定：
   - **Name**: `web-video-editor`
   - **Environment**: `Docker`
   - **Plan**: `Starter ($7/月)` ※無料プランは15分でスリープ
   - **Docker Command**: 自動検出されます

5. **Advanced** → **Add Disk**:
   - **Name**: `video-storage`
   - **Mount Path**: `/app/uploads`
   - **Size**: `10 GB`

6. **Create Web Service** をクリック

### 3. デプロイ完了

デプロイが完了すると、以下のようなURLが発行されます：
```
https://web-video-editor-xxxx.onrender.com
```

## 📋 使い方

1. ブラウザでRenderのURLにアクセス
2. 画像・動画・音声ファイルをアップロード
3. 編集設定を入力
4. 「動画編集開始」をクリック
5. 完成した動画をダウンロード

## 🔧 機能

- ドラッグ&ドロップでファイルアップロード
- リアルタイムログ表示
- 動画の長さ・開始位置指定
- 複数の出力動画管理

## 🛠️ ローカル開発

```bash
# 依存関係インストール
npm install

# 開発サーバー起動
npm start
```

http://localhost:3003 でアクセス

## 📝 技術スタック

- Node.js + Express
- FFmpeg (動画処理)
- Multer (ファイルアップロード)
- HTML/CSS/JavaScript (フロントエンド)

## 🔗 将来の拡張

### Google スプレッドシート連携

`/api/spreadsheet-sync` エンドポイントが準備済み。
GAS (Google Apps Script) からWebhookを送信することで、スプレッドシートから自動実行可能。

### API仕様

**POST /api/edit-video**
```json
{
  "backgroundVideoFile": "video.mp4",
  "imageFile": "overlay.png",
  "audioFile": "audio.mp3",
  "duration": "20",
  "videoStart": "0:00",
  "audioStart": "0:00",
  "outputName": "output.mp4"
}
```

## 🚨 注意事項

- 大きなファイル（100MB以上）は処理に時間がかかります
- 同時に複数の編集を実行すると重くなる可能性があります
- ディスク容量は10GBまで（Renderの設定で変更可能）

## 📞 サポート

社内ツールのため、問題があれば開発者に連絡してください。