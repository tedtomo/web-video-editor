# Google Apps Script セットアップ手順

スプレッドシートの自動更新を有効にするため、Google Apps Scriptでエンドポイントを作成する必要があります。

## 手順

### 1. Google Apps Scriptプロジェクト作成
1. https://script.google.com にアクセス
2. 「新しいプロジェクト」をクリック
3. プロジェクト名を「SpreadsheetUpdater」に変更

### 2. コード.gsにコードを貼り付け

```javascript
function doPost(e) {
  try {
    // POSTデータを解析
    const data = JSON.parse(e.postData.contents);
    const spreadsheetId = data.spreadsheetId;
    const updates = data.updates;
    
    if (!spreadsheetId || !updates) {
      return ContentService
        .createTextOutput(JSON.stringify({
          success: false,
          error: 'spreadsheetIdとupdatesは必須です'
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // スプレッドシートを開く
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheet = spreadsheet.getActiveSheet();
    
    // 更新を実行
    updates.forEach(update => {
      const range = update.range; // 例: "A2", "L3"
      const value = update.value;
      
      sheet.getRange(range).setValue(value);
    });
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        message: '更新完了',
        updatedCount: updates.length
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({
      message: 'SpreadsheetUpdater API - POST only'
    }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

### 3. デプロイ
1. 「デプロイ」→「新しいデプロイ」をクリック
2. 種類で「ウェブアプリ」を選択
3. 説明: 「Spreadsheet Updater API」
4. 実行ユーザー: 「自分」
5. アクセスできるユーザー: 「全員」
6. 「デプロイ」をクリック
7. **ウェブアプリのURL**をコピー（例: `https://script.google.com/macros/s/AKfycbz.../exec`）

### 4. public-sheets-integration.js を更新
`public-sheets-integration.js` の164行目のURLを実際のURLに置き換えてください：

```javascript
const webAppUrl = 'https://script.google.com/macros/s/YOUR_ACTUAL_SCRIPT_ID/exec';
```

### 5. 権限の設定
初回実行時にスプレッドシートへのアクセス権限を許可してください。

## テスト方法

1. Google Apps Scriptをデプロイ後、URLを取得
2. `public-sheets-integration.js` のURLを更新
3. コミット・プッシュしてRenderにデプロイ
4. 「スプレッドシートから実行」を実行
5. 処理完了後、スプレッドシートのL列に動画URLが自動入力される

## 注意事項

- Google Apps Scriptの実行時間制限: 6分
- 1日の実行回数制限があります
- スプレッドシートの編集権限が必要です