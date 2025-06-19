const GoogleIntegration = require('./google-integration');
const SimpleDriveDownloader = require('./simple-drive-downloader');
const VideoEditor = require('./video-editor');
const FileCache = require('./file-cache');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class SpreadsheetProcessor {
  constructor() {
    this.googleIntegration = new GoogleIntegration();
    this.simpleDriveDownloader = new SimpleDriveDownloader();
    this.videoEditor = new VideoEditor();
    this.fileCache = new FileCache();
    this.tempDir = path.join(__dirname, 'temp');
    this.outputDir = path.join(__dirname, 'output');
    // デフォルトでシンプルダウンローダーを使用
    this.useSimpleDownloader = true;
  }

  // ファイル名をサニタイズして正しい拡張子を確保
  sanitizeFileName(fileName) {
    if (!fileName) return null;
    
    // 拡張子を確認
    const ext = path.extname(fileName).toLowerCase();
    const validVideoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv'];
    
    // 無効な拡張子の場合は.mp4に修正
    if (!validVideoExtensions.includes(ext)) {
      const baseName = fileName.replace(/\.[^.]*$/, ''); // 既存の拡張子を削除
      return `${baseName}.mp4`;
    }
    
    return fileName;
  }

  async initialize(credentials) {
    await this.googleIntegration.initialize(credentials);
    await fs.ensureDir(this.tempDir);
    await fs.ensureDir(this.outputDir);
  }

  // スプレッドシートからバッチ処理を実行
  async processSpreadsheet(spreadsheetId, options = {}) {
    const results = [];
    const { range = 'A:L', driveFolderId = null } = options;

    try {
      // 実行対象の行を取得
      const executionRows = await this.googleIntegration.getExecutionRows(spreadsheetId, range);
      
      if (executionRows.length === 0) {
        return {
          success: true,
          message: '実行対象の行がありません',
          results: []
        };
      }

      console.log(`${executionRows.length}件の動画を処理します`);
      executionRows.forEach(row => {
        console.log(`- 行${row.rowIndex}: ${row.outputFileName}`);
      });

      // 各行を順番に処理
      for (const row of executionRows) {
        try {
          console.log(`処理中: ${row.outputFileName} (行: ${row.rowIndex})`);
          
          // 一時ファイルパスを生成
          const tempId = uuidv4();
          const imagePath = path.join(this.tempDir, `${tempId}_image${path.extname(row.imageUrl) || '.jpg'}`);
          const videoPath = path.join(this.tempDir, `${tempId}_video${path.extname(row.videoUrl) || '.mp4'}`);
          const audioPath = path.join(this.tempDir, `${tempId}_audio${path.extname(row.audioUrl) || '.mp3'}`);

          // Google Driveからファイルをダウンロード
          console.log('ファイルをダウンロード中...');
          console.log(`行${row.rowIndex}のURL:`);
          console.log('- 画像URL:', row.imageUrl || 'なし');
          console.log('- 動画URL:', row.videoUrl || 'なし');
          console.log('- 音声URL:', row.audioUrl || 'なし');
          
          if (this.useSimpleDownloader) {
            // シンプルダウンローダーを使用（API認証不要）
            console.log('公開リンクから直接ダウンロード中...');
            const downloads = [];
            
            // キャッシュをチェックしてダウンロードリストを作成
            if (row.imageUrl) {
              const cachedPath = await this.fileCache.get(row.imageUrl);
              if (cachedPath) {
                console.log(`画像はキャッシュから使用: ${path.basename(cachedPath)}`);
                await fs.copy(cachedPath, imagePath);
              } else {
                downloads.push({ url: row.imageUrl, outputPath: imagePath, type: 'image' });
              }
            }
            
            if (row.videoUrl) {
              const cachedPath = await this.fileCache.get(row.videoUrl);
              if (cachedPath) {
                console.log(`動画はキャッシュから使用: ${path.basename(cachedPath)}`);
                await fs.copy(cachedPath, videoPath);
              } else {
                downloads.push({ url: row.videoUrl, outputPath: videoPath, type: 'video' });
              }
            }
            
            if (row.audioUrl) {
              const cachedPath = await this.fileCache.get(row.audioUrl);
              if (cachedPath) {
                console.log(`音声はキャッシュから使用: ${path.basename(cachedPath)}`);
                await fs.copy(cachedPath, audioPath);
              } else {
                downloads.push({ url: row.audioUrl, outputPath: audioPath, type: 'audio' });
              }
            }
            
            console.log(`ダウンロード対象: ${downloads.length}ファイル`);
            
            if (downloads.length > 0) {
              const { errors, success } = await this.simpleDriveDownloader.downloadMultiple(
                downloads.map(d => ({ url: d.url, outputPath: d.outputPath }))
              );
              
              console.log(`ダウンロード結果: 成功${success.length}件、失敗${errors.length}件`);
              
              if (errors.length > 0) {
                const errorMessages = errors.map(e => `${e.url}: ${e.error}`).join('\n');
                throw new Error(`ファイルのダウンロードに失敗しました:\n${errorMessages}`);
              }
              
              // 成功したダウンロードをキャッシュに追加
              for (let i = 0; i < downloads.length; i++) {
                const download = downloads[i];
                const successItem = success.find(s => s.url === download.url);
                if (successItem) {
                  const originalName = `cached_${download.type}${path.extname(download.outputPath)}`;
                  await this.fileCache.put(download.url, download.outputPath, originalName);
                  console.log(`${download.type}をキャッシュに追加しました`);
                }
              }
            }
            
            // ダウンロードしたファイルの存在確認
            console.log('ダウンロードしたファイルの確認:');
            if (imagePath && await fs.pathExists(imagePath)) {
              const stats = await fs.stat(imagePath);
              console.log(`- 画像: ✓ (${stats.size}バイト)`);
            } else {
              console.log('- 画像: ✗');
            }
            if (videoPath && await fs.pathExists(videoPath)) {
              const stats = await fs.stat(videoPath);
              console.log(`- 動画: ✓ (${stats.size}バイト)`);
            } else {
              console.log('- 動画: ✗');
            }
            if (audioPath && await fs.pathExists(audioPath)) {
              const stats = await fs.stat(audioPath);
              console.log(`- 音声: ✓ (${stats.size}バイト)`);
            } else {
              console.log('- 音声: ✗');
            }
          } else {
            // 従来のGoogle Drive APIを使用
            const downloadErrors = [];
            
            try {
              if (row.imageUrl) {
                await this.googleIntegration.downloadFromDrive(row.imageUrl, imagePath);
              }
            } catch (error) {
              downloadErrors.push(`画像: ${error.message}`);
            }
            
            try {
              if (row.videoUrl) {
                await this.googleIntegration.downloadFromDrive(row.videoUrl, videoPath);
              }
            } catch (error) {
              downloadErrors.push(`動画: ${error.message}`);
            }
            
            try {
              if (row.audioUrl) {
                await this.googleIntegration.downloadFromDrive(row.audioUrl, audioPath);
              }
            } catch (error) {
              downloadErrors.push(`音声: ${error.message}`);
            }
            
            // エラーがある場合はまとめて報告
            if (downloadErrors.length > 0) {
              throw new Error(`ファイルのダウンロードに失敗しました:\n${downloadErrors.join('\n')}`);
            }
          }

          // 動画を生成（柔軟な処理）
          console.log('動画を生成中...');
          console.log('動画生成に使用するファイルパス:');
          console.log('- 背景動画:', row.videoUrl ? videoPath : 'なし');
          console.log('- 画像:', row.imageUrl ? imagePath : 'なし');
          console.log('- 音声:', row.audioUrl ? audioPath : 'なし');
          
          const outputResult = await this.videoEditor.createFlexibleVideo({
            backgroundVideoPath: row.videoUrl ? videoPath : null,
            imagePath: row.imageUrl ? imagePath : null,
            audioPath: row.audioUrl ? audioPath : null,
            duration: row.duration,
            videoStart: row.videoStartTime,
            audioStart: row.audioStartTime,
            outputName: row.outputFileName,
            imageScale: row.imageScale / 100, // パーセントを小数に変換
            filterColor: row.filterColor,
            filterOpacity: row.filterOpacity / 100 // パーセントを小数に変換（0-1の範囲）
          });

          // Google Driveにアップロード
          console.log('Google Driveにアップロード中...');
          const videoUrl = await this.googleIntegration.uploadToDrive(
            outputResult.path,  // オブジェクトからパスを取得
            row.outputFileName,
            driveFolderId
          );

          // スプレッドシートを更新
          await this.googleIntegration.recordVideoUrl(spreadsheetId, row.rowIndex, videoUrl);
          await this.googleIntegration.clearExecutionFlag(spreadsheetId, row.rowIndex);

          // 一時ファイルを削除
          await this.cleanupTempFiles([imagePath, videoPath, audioPath]);

          results.push({
            success: true,
            rowIndex: row.rowIndex,
            fileName: row.outputFileName,
            videoUrl: videoUrl
          });

          console.log(`完了: ${row.outputFileName} -> ${videoUrl}`);
        } catch (error) {
          console.error(`エラー (行 ${row.rowIndex}):`, error);
          results.push({
            success: false,
            rowIndex: row.rowIndex,
            fileName: row.outputFileName,
            error: error.message
          });
        }
      }

      return {
        success: true,
        totalProcessed: executionRows.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results: results
      };
    } catch (error) {
      console.error('スプレッドシート処理エラー:', error);
      throw error;
    }
  }

  // 一時ファイルをクリーンアップ
  async cleanupTempFiles(filePaths) {
    for (const filePath of filePaths) {
      if (filePath && await fs.pathExists(filePath)) {
        await fs.remove(filePath);
      }
    }
  }

  // 定期的な処理を実行
  async startPeriodicProcessing(spreadsheetId, intervalMinutes = 5, options = {}) {
    console.log(`${intervalMinutes}分ごとに自動処理を開始します`);
    
    // 初回実行
    await this.processSpreadsheet(spreadsheetId, options);
    
    // 定期実行
    setInterval(async () => {
      try {
        console.log('定期処理を実行中...');
        await this.processSpreadsheet(spreadsheetId, options);
      } catch (error) {
        console.error('定期処理エラー:', error);
      }
    }, intervalMinutes * 60 * 1000);
  }
}

module.exports = SpreadsheetProcessor;