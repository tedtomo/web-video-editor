const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class PublicSheetsIntegration {
  constructor() {
    // 認証不要！
  }

  // ファイル名をサニタイズ
  sanitizeFileName(fileName) {
    if (!fileName) return null;
    
    const ext = fileName.match(/\.[^.]*$/)?.[0]?.toLowerCase() || '';
    const validVideoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv'];
    
    if (!validVideoExtensions.includes(ext)) {
      const baseName = fileName.replace(/\.[^.]*$/, '');
      return `${baseName}.mp4`;
    }
    
    return fileName;
  }

  // Google SheetsのスプレッドシートIDからCSV URLを生成
  getPublicCsvUrl(spreadsheetId, sheetName = null) {
    if (sheetName) {
      // 特定のシート名を指定
      return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
    } else {
      // 最初のシート
      return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
    }
  }

  // CSV データを解析
  parseCsvData(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = this.parseCsvLine(lines[0]);
    const dataRows = lines.slice(1);

    return dataRows.map((line, index) => {
      const row = this.parseCsvLine(line);
      return {
        rowIndex: index + 2, // スプレッドシートの行番号
        rawData: row,
        execute: row[0] === '○' || row[0] === 'o' || row[0] === 'O'
      };
    });
  }

  // CSV行を解析（カンマ区切り、クォート対応）
  parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // エスケープされたクォート
          current += '"';
          i++; // 次の文字をスキップ
        } else {
          // クォートの開始/終了
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // フィールドの終了
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    // 最後のフィールドを追加
    result.push(current.trim());
    return result;
  }

  // スプレッドシートから実行対象の行を取得
  async getExecutionRows(spreadsheetId, sheetName = null) {
    try {
      console.log('📊 公開スプレッドシートからデータ取得開始');
      console.log('📋 スプレッドシートID:', spreadsheetId);
      console.log('📋 シート名:', sheetName || '最初のシート');

      const csvUrl = this.getPublicCsvUrl(spreadsheetId, sheetName);
      console.log('🔗 CSV URL:', csvUrl);

      const response = await axios.get(csvUrl, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Web-Video-Editor/1.0'
        }
      });

      console.log('✅ CSVデータ取得成功');
      console.log('📏 データサイズ:', response.data.length, '文字');

      const allRows = this.parseCsvData(response.data);
      console.log('📊 総行数:', allRows.length);

      // 実行対象の行をフィルタリング
      const executionRows = allRows
        .filter(row => row.execute)
        .map(row => {
          const rowData = {
            rowIndex: row.rowIndex,
            imageUrl: row.rawData[1] || '',
            videoUrl: row.rawData[2] || '',
            audioUrl: row.rawData[3] || '',
            duration: parseInt(row.rawData[4]) || 20,
            outputFileName: this.sanitizeFileName(row.rawData[5]) || `output_${uuidv4()}.mp4`,
            videoStartTime: row.rawData[6] || '0:00',
            audioStartTime: row.rawData[7] || '0:00',
            imageScale: parseInt(row.rawData[8]) || 100,
            filterColor: row.rawData[9] || '#000000',
            filterOpacity: parseInt(row.rawData[10]) || 0,
            outputVideoUrl: row.rawData[11] || ''
          };

          console.log(`\n行${rowData.rowIndex}のデータ:`, {
            imageUrl: rowData.imageUrl ? '設定済み' : 'なし',
            videoUrl: rowData.videoUrl ? '設定済み' : 'なし',
            audioUrl: rowData.audioUrl ? '設定済み' : 'なし',
            outputFileName: rowData.outputFileName
          });

          return rowData;
        });

      console.log(`🎯 実行対象: ${executionRows.length}件`);
      return executionRows;

    } catch (error) {
      console.error('❌ 公開スプレッドシート読み取りエラー:', error.message);
      
      if (error.response) {
        console.error('❌ HTTPステータス:', error.response.status);
        console.error('❌ レスポンス:', error.response.data.substring(0, 200) + '...');
        
        if (error.response.status === 403) {
          throw new Error('スプレッドシートが公開されていません。「リンクを知っている全員が閲覧可能」に設定してください。');
        }
      }
      
      throw new Error(`スプレッドシートの読み取りに失敗しました: ${error.message}`);
    }
  }

  // 簡単コピペ用のURLリストを生成
  generateCopyPasteData(results) {
    console.log('\n📋 ===== スプレッドシート貼り付け用データ =====');
    console.log('以下をコピーしてスプレッドシートのL列に貼り付けてください：\n');
    
    const urls = results.map(result => {
      const fullUrl = result.videoUrl.startsWith('http') 
        ? result.videoUrl 
        : `https://web-video-editor.onrender.com${result.videoUrl}`;
      
      console.log(`行${result.rowIndex}: ${fullUrl}`);
      return fullUrl;
    });
    
    console.log('\n📋 一括コピー用（縦に並んだURL）:');
    console.log(urls.join('\n'));
    console.log('\n📋 ============================================\n');
    
    return urls;
  }

  async clearExecutionFlag(spreadsheetId, rowIndex) {
    console.log(`ℹ️ 行${rowIndex}の実行フラグ（○）を手動で削除してください`);
    return { updated: false, message: '手動削除が必要' };
  }

  async recordVideoUrl(spreadsheetId, rowIndex, videoUrl) {
    // RenderのURLをフルURLに変換
    const fullVideoUrl = videoUrl.startsWith('http') ? videoUrl : `https://web-video-editor.onrender.com${videoUrl}`;
    
    console.log(`📋 行${rowIndex}に貼り付けるURL: ${fullVideoUrl}`);
    
    return { 
      updated: false, 
      message: '手動貼り付けが必要', 
      videoUrl: fullVideoUrl,
      rowIndex: rowIndex
    };
  }
}

module.exports = PublicSheetsIntegration;