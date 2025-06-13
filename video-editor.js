const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs-extra');
const path = require('path');

class VideoEditor {
  constructor() {
    ffmpeg.setFfmpegPath(ffmpegStatic);
    this.outputDir = path.join(__dirname, 'output');
    fs.ensureDirSync(this.outputDir);
  }

  // 時間文字列を秒数に変換
  parseTimeToSeconds(timeStr) {
    if (!timeStr) return 0;
    
    const parts = timeStr.toString().split(':');
    let seconds = 0;
    
    if (parts.length === 2) {
      // MM:SS形式
      seconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
    } else if (parts.length === 3) {
      // HH:MM:SS形式
      seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
    } else {
      // 秒数のみ
      seconds = parseInt(timeStr);
    }
    
    return seconds;
  }

  // 複合動画作成
  async createCompositeVideo({ 
    backgroundVideoPath, 
    imagePath, 
    audioPath, 
    duration, 
    videoStart = 0, 
    audioStart = 0, 
    outputName,
    imageScale = 0.8,
    filterColor = '#000000',
    filterOpacity = 0
  }) {
    const outputPath = path.join(this.outputDir, outputName);
    
    console.log('🎬 動画合成設定:');
    console.log('- 背景動画:', backgroundVideoPath);
    console.log('- 画像:', imagePath);
    console.log('- 音声:', audioPath);
    console.log('- 時間長:', duration, '秒');
    console.log('- 動画開始:', videoStart, '秒');
    console.log('- 音声開始:', audioStart, '秒');
    console.log('- 画像スケール:', imageScale * 100, '%');
    console.log('- フィルター色:', filterColor);
    console.log('- フィルター透明度:', filterOpacity * 100, '%');
    console.log('- 出力:', outputPath);

    return new Promise((resolve, reject) => {
      const ff = ffmpeg();
      
      // 入力ファイルを追加
      ff.input(backgroundVideoPath)
        .inputOptions(['-ss', videoStart.toString(), '-t', duration.toString()])
        .input(audioPath)
        .inputOptions(['-ss', audioStart.toString(), '-t', duration.toString()])
        .input(imagePath);
        
      // 画像を指定されたスケールでオーバーレイ（フィルター機能は一旦保留）
      ff.complexFilter([
        // 画像を指定されたスケールに変更（高さは比例）
        `[2:v]scale=iw*${imageScale}:ih*${imageScale}[scaled]`,
        // スケールした画像を中央に配置
        '[0:v][scaled]overlay=x=(W-w)/2:y=(H-h)/2[outv]'
      ]);
      
      // 出力設定
      ff.outputOptions([
          '-map', '[outv]',
          '-map', '1:a',
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-preset', 'ultrafast',  // より高速なプリセット
          '-crf', '28',            // 品質を少し下げてメモリ使用量を削減
          '-threads', '2',         // スレッド数を制限
          '-y'
        ])
        .output(outputPath)
        
        // イベントハンドラー
        .on('start', (commandLine) => {
          console.log('🔧 FFmpeg コマンド:', commandLine);
        })
        .on('stderr', (stderrLine) => {
          console.log('FFmpeg:', stderrLine);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`⏳ 進行状況: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          console.log('✅ 動画合成完了:', outputName);
          resolve({
            filename: outputName,
            path: outputPath,
            url: `/output/${outputName}`
          });
        })
        .on('error', (err) => {
          console.error('❌ FFmpeg エラー:', err.message);
          console.error('詳細:', err);
          reject(new Error(`動画合成失敗: ${err.message}`));
        });
        
      // タイムアウト設定（3分）
      const timeout = setTimeout(() => {
        ff.kill('SIGKILL');
        reject(new Error('動画処理がタイムアウトしました'));
      }, 180000);
      
      ff.on('end', () => {
        clearTimeout(timeout);
      }).on('error', () => {
        clearTimeout(timeout);
      });
      
      ff.run();
    });
  }

  // 動画情報取得
  async getVideoInfo(videoPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            duration: metadata.format.duration,
            width: metadata.streams[0].width,
            height: metadata.streams[0].height,
            fps: eval(metadata.streams[0].r_frame_rate)
          });
        }
      });
    });
  }

  // 出力動画リスト取得
  async getOutputVideos() {
    try {
      const files = await fs.readdir(this.outputDir);
      const videos = files.filter(file => file.endsWith('.mp4'));
      
      const videoList = await Promise.all(
        videos.map(async (filename) => {
          const filePath = path.join(this.outputDir, filename);
          const stats = await fs.stat(filePath);
          
          let videoInfo = null;
          try {
            videoInfo = await this.getVideoInfo(filePath);
          } catch (error) {
            console.warn('動画情報取得失敗:', filename);
          }

          return {
            filename,
            size: stats.size,
            created: stats.mtime,
            duration: videoInfo ? videoInfo.duration : null,
            width: videoInfo ? videoInfo.width : null,
            height: videoInfo ? videoInfo.height : null,
            url: `/output/${filename}`
          };
        })
      );

      return videoList.sort((a, b) => b.created - a.created);
    } catch (error) {
      throw new Error(`動画リスト取得エラー: ${error.message}`);
    }
  }

  // クリーンアップ
  async cleanup(olderThanHours = 24) {
    try {
      const files = await fs.readdir(this.outputDir);
      const now = Date.now();
      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.outputDir, file);
        const stats = await fs.stat(filePath);
        const ageInHours = (now - stats.mtime.getTime()) / (1000 * 60 * 60);

        if (ageInHours > olderThanHours) {
          await fs.remove(filePath);
          deletedCount++;
          console.log(`🗑️ 古いファイルを削除: ${file}`);
        }
      }

      console.log(`🧹 クリーンアップ完了: ${deletedCount}ファイル削除`);
      return deletedCount;
    } catch (error) {
      console.error('❌ クリーンアップエラー:', error);
      throw error;
    }
  }
}

module.exports = VideoEditor;