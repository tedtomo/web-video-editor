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
    outputName 
  }) {
    const outputPath = path.join(this.outputDir, outputName);
    
    console.log('🎬 動画合成設定:');
    console.log('- 背景動画:', backgroundVideoPath);
    console.log('- 画像:', imagePath);
    console.log('- 音声:', audioPath);
    console.log('- 時間長:', duration, '秒');
    console.log('- 動画開始:', videoStart, '秒');
    console.log('- 音声開始:', audioStart, '秒');
    console.log('- 出力:', outputPath);

    return new Promise((resolve, reject) => {
      ffmpeg()
        // 背景動画（トリミング）
        .input(backgroundVideoPath)
        .inputOptions(['-ss', videoStart.toString(), '-t', duration.toString()])
        
        // 音声（トリミング）
        .input(audioPath)
        .inputOptions(['-ss', audioStart.toString(), '-t', duration.toString()])
        
        // 画像オーバーレイ
        .input(imagePath)
        
        // フィルター設定：画像を中央配置でオーバーレイ（80%は一旦保留）
        .complexFilter([
          // 画像をオーバーレイ（中央配置）
          '[0:v][2:v]overlay=x=(W-w)/2:y=(H-h)/2[outv]'
        ])
        
        // 出力設定
        .outputOptions([
          '-map', '[outv]',      // 合成された映像
          '-map', '1:a',         // 音声入力
          '-c:v', 'libx264',     // 動画コーデック
          '-c:a', 'aac',         // 音声コーデック
          '-preset', 'fast',     // エンコード速度
          '-crf', '23',          // 品質設定
          '-y'                   // 上書き許可
        ])
        .output(outputPath)
        
        // イベントハンドラー
        .on('start', (commandLine) => {
          console.log('🔧 FFmpeg コマンド:', commandLine);
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
          reject(new Error(`動画合成失敗: ${err.message}`));
        })
        .run();
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