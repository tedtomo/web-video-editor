/**
 * Web Video Editor - Google Sheets統合
 * スプレッドシートから直接動画処理を実行するためのGoogle Apps Script
 */

// Web Video EditorのエンドポイントURL（Renderのドメイン）
const WEB_VIDEO_EDITOR_URL = 'https://web-video-editor.onrender.com';

/**
 * スプレッドシートにメニューを追加
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🎬 動画エディター')
    .addItem('実行（○マークの行を処理）', 'executeVideoProcessing')
    .addItem('処理状況を確認', 'checkProcessingStatus')
    .addSeparator()
    .addItem('設定', 'showSettings')
    .addToUi();
}

/**
 * 動画処理を実行
 */
function executeVideoProcessing() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
  
  // 実行確認
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    '動画処理を開始',
    '○マークが付いている行の動画を作成します。\n続行しますか？',
    ui.ButtonSet.YES_NO
  );
  
  if (response !== ui.Button.YES) {
    return;
  }
  
  // 処理開始を通知
  ui.alert('処理開始', '動画処理を開始しました。\n処理完了まで数分かかる場合があります。', ui.ButtonSet.OK);
  
  try {
    // Web Video EditorのAPIを呼び出し
    const payload = {
      spreadsheetId: spreadsheetId,
      sheetName: sheet.getName()
    };
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(`${WEB_VIDEO_EDITOR_URL}/api/spreadsheet-sync`, options);
    const result = JSON.parse(response.getContentText());
    
    if (response.getResponseCode() === 200) {
      if (result.processing) {
        // 非同期処理開始
        ui.alert(
          '処理開始',
          `${result.totalRows}件の動画処理を開始しました。\n\n` +
          '処理はバックグラウンドで実行されます。\n' +
          '完了すると自動的に：\n' +
          '・L列に動画URLが記録されます\n' +
          '・A列の○マークが削除されます',
          ui.ButtonSet.OK
        );
        
        // 処理状況を定期的にチェック（最大10分）
        checkProcessingStatusPeriodically(result.totalRows);
        
      } else {
        // 同期処理完了（通常はこちらは使われない）
        ui.alert(
          '処理完了',
          `処理が完了しました。\n成功: ${result.successful}件\n失敗: ${result.failed}件`,
          ui.ButtonSet.OK
        );
      }
    } else {
      ui.alert('エラー', `処理に失敗しました。\n${result.error || 'Unknown error'}`, ui.ButtonSet.OK);
    }
    
  } catch (error) {
    ui.alert('エラー', `処理中にエラーが発生しました。\n${error.toString()}`, ui.ButtonSet.OK);
  }
}

/**
 * 処理状況を定期的にチェック
 */
function checkProcessingStatusPeriodically(expectedCount) {
  // トリガーを設定して定期的にチェック
  const trigger = ScriptApp.newTrigger('checkProcessingStatusOnce')
    .timeBased()
    .everyMinutes(1)
    .create();
  
  // プロパティに期待する処理数とトリガーIDを保存
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty('expectedCount', expectedCount.toString());
  properties.setProperty('statusCheckTriggerId', trigger.getUniqueId());
  properties.setProperty('checkStartTime', new Date().getTime().toString());
}

/**
 * 処理状況を1回チェック
 */
function checkProcessingStatusOnce() {
  const properties = PropertiesService.getScriptProperties();
  const expectedCount = parseInt(properties.getProperty('expectedCount') || '0');
  const triggerId = properties.getProperty('statusCheckTriggerId');
  const startTime = parseInt(properties.getProperty('checkStartTime') || '0');
  
  // 10分以上経過していたらタイムアウト
  if (new Date().getTime() - startTime > 10 * 60 * 1000) {
    removeTriggerById(triggerId);
    properties.deleteProperty('expectedCount');
    properties.deleteProperty('statusCheckTriggerId');
    properties.deleteProperty('checkStartTime');
    return;
  }
  
  // L列に記録された動画URLの数をカウント
  const sheet = SpreadsheetApp.getActiveSheet();
  const lastRow = sheet.getLastRow();
  let completedCount = 0;
  
  if (lastRow > 1) {
    const lColumnValues = sheet.getRange(2, 12, lastRow - 1, 1).getValues(); // L列（12列目）
    completedCount = lColumnValues.filter(row => row[0] && row[0].toString().includes('web-video-editor.onrender.com')).length;
  }
  
  // 全て完了していたら通知してトリガーを削除
  if (completedCount >= expectedCount) {
    SpreadsheetApp.getUi().alert(
      '処理完了',
      `全${expectedCount}件の動画処理が完了しました！\n\nL列に動画URLが記録され、A列の○マークが削除されました。`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    
    removeTriggerById(triggerId);
    properties.deleteProperty('expectedCount');
    properties.deleteProperty('statusCheckTriggerId');
    properties.deleteProperty('checkStartTime');
  }
}

/**
 * トリガーを削除
 */
function removeTriggerById(triggerId) {
  if (!triggerId) return;
  
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getUniqueId() === triggerId) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

/**
 * 処理状況を手動で確認
 */
function checkProcessingStatus() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const lastRow = sheet.getLastRow();
  let processingCount = 0;
  let completedCount = 0;
  
  if (lastRow > 1) {
    const data = sheet.getRange(2, 1, lastRow - 1, 12).getValues();
    
    data.forEach(row => {
      const hasCircle = row[0] === '○' || row[0] === 'o' || row[0] === 'O';
      const hasUrl = row[11] && row[11].toString().includes('web-video-editor.onrender.com');
      
      if (hasCircle && !hasUrl) {
        processingCount++;
      } else if (hasUrl) {
        completedCount++;
      }
    });
  }
  
  const ui = SpreadsheetApp.getUi();
  ui.alert(
    '処理状況',
    `完了: ${completedCount}件\n処理待ち: ${processingCount}件`,
    ui.ButtonSet.OK
  );
}

/**
 * 設定画面を表示
 */
function showSettings() {
  const ui = SpreadsheetApp.getUi();
  const html = HtmlService.createHtmlOutput(`
    <div style="padding: 20px; font-family: Arial, sans-serif;">
      <h3>Web Video Editor 設定</h3>
      
      <h4>現在の設定:</h4>
      <p>エンドポイント: ${WEB_VIDEO_EDITOR_URL}</p>
      <p>スプレッドシートID: ${SpreadsheetApp.getActiveSpreadsheet().getId()}</p>
      
      <h4>使い方:</h4>
      <ol>
        <li>A列に「○」を入力（処理対象）</li>
        <li>B列に画像URL</li>
        <li>C列に動画URL</li>
        <li>D列に音声URL</li>
        <li>E列に動画時間（秒）</li>
        <li>F列に出力ファイル名</li>
        <li>他の列は任意</li>
      </ol>
      
      <h4>処理の流れ:</h4>
      <ol>
        <li>メニューから「実行」をクリック</li>
        <li>バックグラウンドで動画処理</li>
        <li>完了するとL列にURL記録</li>
        <li>A列の○が自動削除</li>
      </ol>
      
      <p style="color: #666; font-size: 12px; margin-top: 20px;">
        ※ 処理には数分かかる場合があります<br>
        ※ 一度に大量の動画を処理する場合は時間がかかります
      </p>
    </div>
  `)
  .setWidth(400)
  .setHeight(500);
  
  ui.showModalDialog(html, 'Web Video Editor 設定');
}

/**
 * インストール時の初期設定
 */
function install() {
  onOpen();
  const ui = SpreadsheetApp.getUi();
  ui.alert(
    'インストール完了',
    'Web Video Editorがインストールされました。\n\n' +
    'メニューバーに「🎬 動画エディター」が追加されました。\n' +
    'このメニューから動画処理を実行できます。',
    ui.ButtonSet.OK
  );
}