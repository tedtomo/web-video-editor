const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs-extra');
const path = require('path');
const GoogleDriveUploader = require('./google-drive-uploader');

class VideoEditor {
  constructor() {
    ffmpeg.setFfmpegPath(ffmpegStatic);
    this.outputDir = path.join(__dirname, 'output');
    fs.ensureDirSync(this.outputDir);
    this.driveUploader = new GoogleDriveUploader();
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

  // ファイルタイプを判定（画像か動画か）
  async getFileType(filePath) {
    if (!filePath) return null;
    const ext = path.extname(filePath).toLowerCase();
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'];
    
    if (imageExtensions.includes(ext)) return 'image';
    if (videoExtensions.includes(ext)) return 'video';
    return 'unknown';
  }

  // 柔軟な動画作成（利用可能なファイルに応じて処理）
  async createFlexibleVideo({
    backgroundVideoPath,
    imagePath,
    audioPath,
    duration = 20,
    videoStart = 0,
    audioStart = 0,
    outputName,
    imageScale = 0.8,
    filterColor = '#000000',
    filterOpacity = 0
  }) {
    // 利用可能なファイルを確認
    const hasVideo = backgroundVideoPath && await fs.pathExists(backgroundVideoPath);
    const hasOverlay = imagePath && await fs.pathExists(imagePath);
    const hasAudio = audioPath && await fs.pathExists(audioPath);
    
    // オーバーレイファイルのタイプを判定
    const overlayType = hasOverlay ? await this.getFileType(imagePath) : null;

    console.log('📁 利用可能なファイル:');
    console.log('- 背景動画:', hasVideo ? `✓ (${backgroundVideoPath})` : `✗ (${backgroundVideoPath})`);
    console.log('- オーバーレイ:', hasOverlay ? `✓ (${overlayType}: ${imagePath})` : `✗ (${imagePath})`);
    console.log('- 音声:', hasAudio ? `✓ (${audioPath})` : `✗ (${audioPath})`);

    // すべてのファイルがある場合（画像または動画オーバーレイ）
    if (hasVideo && hasOverlay && hasAudio) {
      if (overlayType === 'image') {
        // 従来の画像オーバーレイ処理
        return this.createCompositeVideo({
          backgroundVideoPath,
          imagePath,
          audioPath,
          duration,
          videoStart,
          audioStart,
          outputName,
          imageScale,
          filterColor,
          filterOpacity
        });
      } else if (overlayType === 'video') {
        // 新しい動画オーバーレイ処理
        return this.createCompositeVideoWithVideoOverlay({
          backgroundVideoPath,
          overlayVideoPath: imagePath,
          audioPath,
          duration,
          videoStart,
          audioStart,
          outputName,
          imageScale,
          filterColor,
          filterOpacity
        });
      }
    }

    // 音声のみの場合は、黒い背景の動画を作成
    if (!hasVideo && !hasOverlay && hasAudio) {
      return this.createAudioOnlyVideo({
        audioPath,
        duration,
        audioStart,
        outputName
      });
    }

    // 動画と音声のみの場合
    if (hasVideo && !hasOverlay && hasAudio) {
      console.log('🎬 動画と音声のみで処理します');
      return this.createVideoWithAudio({
        videoPath: backgroundVideoPath,
        audioPath,
        duration,
        videoStart,
        audioStart,
        outputName
      });
    }

    // 動画とオーバーレイのみの場合（音声なし）
    if (hasVideo && hasOverlay && !hasAudio) {
      if (overlayType === 'image') {
        console.log('🎬 動画と画像のみで処理します（音声なし）');
        return this.createVideoWithImageOnly({
          videoPath: backgroundVideoPath,
          imagePath,
          duration,
          videoStart,
          outputName,
          imageScale,
          filterColor,
          filterOpacity
        });
      } else if (overlayType === 'video') {
        console.log('🎬 動画と動画オーバーレイのみで処理します（音声なし）');
        return this.createVideoWithVideoOverlayOnly({
          videoPath: backgroundVideoPath,
          overlayVideoPath: imagePath,
          duration,
          videoStart,
          outputName,
          imageScale,
          filterColor,
          filterOpacity
        });
      }
    }

    // 動画のみの場合
    if (hasVideo && !hasOverlay && !hasAudio) {
      console.log('🎬 動画のみで処理します');
      return this.createVideoOnly({
        videoPath: backgroundVideoPath,
        duration,
        videoStart,
        outputName
      });
    }

    // その他の組み合わせも必要に応じて追加可能
    console.error('利用可能なファイル組み合わせではありません:', { hasVideo, hasOverlay, hasAudio, overlayType });
    throw new Error('有効なファイルの組み合わせではありません');
  }

  // 音声のみから動画を作成（黒い背景）
  async createAudioOnlyVideo({
    audioPath,
    duration,
    audioStart = 0,
    outputName
  }) {
    const outputPath = path.join(this.outputDir, outputName);
    
    console.log('🎵 音声のみの動画を作成:');
    console.log('- 音声:', audioPath);
    console.log('- 時間長:', duration, '秒');
    console.log('- 音声開始:', audioStart, '秒');

    return new Promise((resolve, reject) => {
      const ff = ffmpeg();
      
      // 黒い背景を生成
      ff.input('color=c=black:s=1920x1080:d=' + duration)
        .inputFormat('lavfi')
        .input(audioPath)
        .inputOptions(['-ss', audioStart.toString(), '-t', duration.toString()]);

      // 出力設定
      ff.outputOptions([
          '-map', '0:v',
          '-map', '1:a',
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-pix_fmt', 'yuv420p',
          '-shortest'
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log('🔧 FFmpeg コマンド:', commandLine);
        })
        .on('end', () => {
          console.log('✅ 動画生成完了:', outputName);
          resolve({
            filename: outputName,
            path: outputPath,
            url: `/output/${outputName}`
          });
        })
        .on('error', (err) => {
          console.error('❌ FFmpeg エラー:', err.message);
          reject(new Error(`動画生成失敗: ${err.message}`));
        })
        .run();
    });
  }

  // 動画と音声を組み合わせる（画像オーバーレイなし）
  async createVideoWithAudio({
    videoPath,
    audioPath,
    duration,
    videoStart = 0,
    audioStart = 0,
    outputName
  }) {
    const outputPath = path.join(this.outputDir, outputName);
    
    console.log('🎬 動画と音声を結合:');
    console.log('- 動画:', videoPath);
    console.log('- 音声:', audioPath);
    console.log('- 時間長:', duration, '秒');

    return new Promise((resolve, reject) => {
      const ff = ffmpeg();
      
      ff.input(videoPath)
        .inputOptions(['-ss', videoStart.toString(), '-t', duration.toString()])
        .input(audioPath)
        .inputOptions(['-ss', audioStart.toString(), '-t', duration.toString()]);

      // 出力設定
      ff.outputOptions([
          '-map', '0:v',
          '-map', '1:a',
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-pix_fmt', 'yuv420p',
          '-shortest'
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log('🔧 FFmpeg コマンド:', commandLine);
        })
        .on('end', () => {
          console.log('✅ 動画生成完了:', outputName);
          resolve({
            filename: outputName,
            path: outputPath,
            url: `/output/${outputName}`
          });
        })
        .on('error', (err) => {
          console.error('❌ FFmpeg エラー:', err.message);
          reject(new Error(`動画生成失敗: ${err.message}`));
        })
        .run();
    });
  }

  // 動画と画像のみの処理（音声なし）
  async createVideoWithImageOnly({
    videoPath,
    imagePath,
    duration,
    videoStart = 0,
    outputName,
    imageScale = 0.8,
    filterColor = '#000000',
    filterOpacity = 0
  }) {
    const outputPath = path.join(this.outputDir, outputName);
    
    console.log('🎬 動画と画像を結合（音声なし）:');
    console.log('- 動画:', videoPath);
    console.log('- 画像:', imagePath);
    console.log('- 時間長:', duration, '秒');

    return new Promise((resolve, reject) => {
      const ff = ffmpeg();
      
      ff.input(videoPath)
        .inputOptions(['-ss', videoStart.toString(), '-t', duration.toString()])
        .input(imagePath);

      // フィルターチェーンを構築
      console.log('🎨 フィルター適用判定:', { filterOpacity, filterColor, apply: filterOpacity > 0 });
      
      let filterComplex = '';
      
      // 画像をスケール
      filterComplex += `[1:v]scale=w='min(iw*${imageScale},1920)':h='min(ih*${imageScale},1080)':force_original_aspect_ratio=decrease[scaled];`;
      
      // 画像を動画にオーバーレイ
      filterComplex += '[0:v][scaled]overlay=x=(W-w)/2:y=(H-h)/2[composite];';
      
      // カラーフィルターを適用（元の実装に戻す）
      if (filterOpacity > 0) {
        // カラーを16進数からRGBに変換
        const r = parseInt(filterColor.substr(1, 2), 16);
        const g = parseInt(filterColor.substr(3, 2), 16);
        const b = parseInt(filterColor.substr(5, 2), 16);
        
        // colorchannelmixerを使用（元の実装）
        const rNorm = r / 255;
        const gNorm = g / 255;
        const bNorm = b / 255;
        
        // filterOpacityは既に0-1の範囲
        const opacity = filterOpacity;
        
        // 色相と透明度を調整
        const rr = 1 - opacity + rNorm * opacity;
        const gg = 1 - opacity + gNorm * opacity;
        const bb = 1 - opacity + bNorm * opacity;
        
        filterComplex += `[composite]colorchannelmixer=rr=${rr}:gg=${gg}:bb=${bb}[outv]`;
        console.log('✅ カラーフィルター適用:', filterColor, '透明度:', (opacity * 100).toFixed(0) + '%');
      } else {
        filterComplex += '[composite]copy[outv]';
        console.log('⏭️ フィルターをスキップ（透明度が0）');
      }
      
      // フィルターチェーンをログ出力
      console.log('📐 最終フィルターチェーン:', filterComplex);
      ff.complexFilter(filterComplex);

      // 出力設定（音声なし）
      ff.outputOptions([
          '-map', '[outv]',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-pix_fmt', 'yuv420p',
          '-threads', '1',
          '-max_muxing_queue_size', '1024',
          '-y'
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log('🔧 FFmpeg コマンド:', commandLine);
        })
        .on('end', () => {
          console.log('✅ 動画生成完了:', outputName);
          resolve({
            filename: outputName,
            path: outputPath,
            url: `/output/${outputName}`
          });
        })
        .on('error', (err) => {
          console.error('❌ FFmpeg エラー:', err.message);
          reject(new Error(`動画生成失敗: ${err.message}`));
        })
        .run();
    });
  }

  // 動画のみの処理
  async createVideoOnly({
    videoPath,
    duration,
    videoStart = 0,
    outputName
  }) {
    const outputPath = path.join(this.outputDir, outputName);
    
    console.log('🎬 動画のみを処理:');
    console.log('- 動画:', videoPath);
    console.log('- 時間長:', duration, '秒');

    return new Promise((resolve, reject) => {
      const ff = ffmpeg();
      
      ff.input(videoPath)
        .inputOptions(['-ss', videoStart.toString(), '-t', duration.toString()]);

      // 出力設定
      ff.outputOptions([
          '-map', '0:v',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-pix_fmt', 'yuv420p',
          '-threads', '1',
          '-max_muxing_queue_size', '1024',
          '-y'
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log('🔧 FFmpeg コマンド:', commandLine);
        })
        .on('end', () => {
          console.log('✅ 動画生成完了:', outputName);
          resolve({
            filename: outputName,
            path: outputPath,
            url: `/output/${outputName}`
          });
        })
        .on('error', (err) => {
          console.error('❌ FFmpeg エラー:', err.message);
          reject(new Error(`動画生成失敗: ${err.message}`));
        })
        .run();
    });
  }

  // 動画オーバーレイと音声を含む複合動画作成
  async createCompositeVideoWithVideoOverlay({
    backgroundVideoPath,
    overlayVideoPath,
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
    
    console.log('🎬 動画オーバーレイ合成設定:');
    console.log('- 背景動画:', backgroundVideoPath);
    console.log('- オーバーレイ動画:', overlayVideoPath);
    console.log('- 音声:', audioPath);
    console.log('- 時間長:', duration, '秒');
    console.log('- 動画開始:', videoStart, '秒');
    console.log('- 音声開始:', audioStart, '秒');
    console.log('- オーバーレイスケール:', imageScale * 100, '%');
    console.log('- フィルター色:', filterColor);
    console.log('- フィルター透明度:', filterOpacity * 100, '%');
    console.log('- 出力:', outputPath);

    return new Promise((resolve, reject) => {
      const ff = ffmpeg();
      
      // 入力ファイルを追加
      ff.input(backgroundVideoPath)
        .inputOptions([
          '-ss', this.parseTimeToSeconds(videoStart).toString(), 
          '-t', duration.toString(),
          '-vsync', '0'
        ])
        .input(audioPath)
        .inputOptions(['-ss', this.parseTimeToSeconds(audioStart).toString(), '-t', duration.toString()])
        .input(overlayVideoPath)
        .inputOptions([
          '-ss', '0',  // オーバーレイ動画は最初から再生
          '-t', duration.toString(),
          '-vsync', '0'
        ]);
        
      // フィルターチェーンを構築
      console.log('🎨 動画オーバーレイフィルター適用判定:', { filterOpacity, filterColor, apply: filterOpacity > 0 });
      
      let filterComplex = '';
      
      // オーバーレイ動画をスケール
      filterComplex += `[2:v]scale=w='min(iw*${imageScale},1920)':h='min(ih*${imageScale},1080)':force_original_aspect_ratio=decrease[scaled];`;
      
      // 動画を背景動画にオーバーレイ
      filterComplex += '[0:v][scaled]overlay=x=(W-w)/2:y=(H-h)/2[composite];';
      
      // カラーフィルターを適用
      if (filterOpacity > 0) {
        const r = parseInt(filterColor.substr(1, 2), 16);
        const g = parseInt(filterColor.substr(3, 2), 16);
        const b = parseInt(filterColor.substr(5, 2), 16);
        
        const rNorm = r / 255;
        const gNorm = g / 255;
        const bNorm = b / 255;
        const opacity = filterOpacity;
        
        const rr = 1 - opacity + rNorm * opacity;
        const gg = 1 - opacity + gNorm * opacity;
        const bb = 1 - opacity + bNorm * opacity;
        
        filterComplex += `[composite]colorchannelmixer=rr=${rr}:gg=${gg}:bb=${bb}[outv]`;
        console.log('✅ カラーフィルター適用:', filterColor, '透明度:', (opacity * 100).toFixed(0) + '%');
      } else {
        filterComplex += '[composite]copy[outv]';
        console.log('⏭️ フィルターをスキップ（透明度が0）');
      }
      
      console.log('📐 動画オーバーレイ フィルターチェーン:', filterComplex);
      ff.complexFilter(filterComplex);
      
      // 出力設定
      ff.outputOptions([
          '-map', '[outv]',
          '-map', '1:a',
          '-c:v', 'libx264',
          '-c:a', 'copy',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-pix_fmt', 'yuv420p',
          '-threads', '2',
          '-max_muxing_queue_size', '1024',
          '-shortest',
          '-y'
        ])
        .output(outputPath)
        
        .on('start', (commandLine) => {
          console.log('🔧 FFmpeg コマンド:', commandLine);
        })
        .on('stderr', (stderrLine) => {
          console.log('FFmpeg:', stderrLine);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`⏳ 進行状況: ${Math.round(progress.percent)}% | 時間: ${progress.timemark || 'N/A'} | 速度: ${progress.currentKbps || 'N/A'} kbps`);
          }
        })
        .on('end', () => {
          console.log('✅ 動画オーバーレイ合成完了:', outputName);
          resolve({
            filename: outputName,
            path: outputPath,
            url: `/output/${outputName}`
          });
        })
        .on('error', (err) => {
          console.error('❌ FFmpeg エラー:', err.message);
          console.error('詳細:', err);
          reject(new Error(`動画オーバーレイ合成失敗: ${err.message}`));
        });
        
      // タイムアウト設定（5分）
      const timeout = setTimeout(() => {
        console.error('⏱️ タイムアウト: 5分経過したため処理を中止します');
        ff.kill('SIGKILL');
        reject(new Error('動画処理がタイムアウトしました（5分経過）'));
      }, 300000);
      
      ff.on('end', () => {
        clearTimeout(timeout);
      }).on('error', () => {
        clearTimeout(timeout);
      });
      
      ff.run();
    });
  }

  // 動画とオーバーレイ動画のみの処理（音声なし）
  async createVideoWithVideoOverlayOnly({
    videoPath,
    overlayVideoPath,
    duration,
    videoStart = 0,
    outputName,
    imageScale = 0.8,
    filterColor = '#000000',
    filterOpacity = 0
  }) {
    const outputPath = path.join(this.outputDir, outputName);
    
    console.log('🎬 動画と動画オーバーレイを結合（音声なし）:');
    console.log('- 背景動画:', videoPath);
    console.log('- オーバーレイ動画:', overlayVideoPath);
    console.log('- 時間長:', duration, '秒');

    return new Promise((resolve, reject) => {
      const ff = ffmpeg();
      
      ff.input(videoPath)
        .inputOptions(['-ss', videoStart.toString(), '-t', duration.toString()])
        .input(overlayVideoPath)
        .inputOptions(['-ss', '0', '-t', duration.toString()]);

      // フィルターチェーンを構築
      console.log('🎨 動画オーバーレイフィルター適用判定:', { filterOpacity, filterColor, apply: filterOpacity > 0 });
      
      let filterComplex = '';
      
      // オーバーレイ動画をスケール
      filterComplex += `[1:v]scale=w='min(iw*${imageScale},1920)':h='min(ih*${imageScale},1080)':force_original_aspect_ratio=decrease[scaled];`;
      
      // 動画を背景動画にオーバーレイ
      filterComplex += '[0:v][scaled]overlay=x=(W-w)/2:y=(H-h)/2[composite];';
      
      // カラーフィルターを適用
      if (filterOpacity > 0) {
        const r = parseInt(filterColor.substr(1, 2), 16);
        const g = parseInt(filterColor.substr(3, 2), 16);
        const b = parseInt(filterColor.substr(5, 2), 16);
        
        const rNorm = r / 255;
        const gNorm = g / 255;
        const bNorm = b / 255;
        const opacity = filterOpacity;
        
        const rr = 1 - opacity + rNorm * opacity;
        const gg = 1 - opacity + gNorm * opacity;
        const bb = 1 - opacity + bNorm * opacity;
        
        filterComplex += `[composite]colorchannelmixer=rr=${rr}:gg=${gg}:bb=${bb}[outv]`;
        console.log('✅ カラーフィルター適用:', filterColor, '透明度:', (opacity * 100).toFixed(0) + '%');
      } else {
        filterComplex += '[composite]copy[outv]';
        console.log('⏭️ フィルターをスキップ（透明度が0）');
      }
      
      console.log('📐 最終フィルターチェーン:', filterComplex);
      ff.complexFilter(filterComplex);

      // 出力設定（音声なし）
      ff.outputOptions([
          '-map', '[outv]',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-pix_fmt', 'yuv420p',
          '-threads', '1',
          '-max_muxing_queue_size', '1024',
          '-y'
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log('🔧 FFmpeg コマンド:', commandLine);
        })
        .on('end', () => {
          console.log('✅ 動画オーバーレイ処理完了:', outputName);
          resolve({
            filename: outputName,
            path: outputPath,
            url: `/output/${outputName}`
          });
        })
        .on('error', (err) => {
          console.error('❌ FFmpeg エラー:', err.message);
          reject(new Error(`動画オーバーレイ処理失敗: ${err.message}`));
        })
        .run();
    });
  }

  // 複合動画作成（既存のメソッド）
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
        .inputOptions([
          '-ss', this.parseTimeToSeconds(videoStart).toString(), 
          '-t', duration.toString(),
          '-vsync', '0'  // 入力の同期を無効化
        ])
        .input(audioPath)
        .inputOptions(['-ss', this.parseTimeToSeconds(audioStart).toString(), '-t', duration.toString()])
        .input(imagePath)
        .inputOptions(['-loop', '1', '-t', duration.toString()]); // 画像をループさせる
        
      // フィルターチェーンを構築
      console.log('🎨 フィルター適用判定:', { filterOpacity, filterColor, apply: filterOpacity > 0 });
      
      let filterComplex = '';
      
      // 画像をスケール
      filterComplex += `[2:v]scale=w='min(iw*${imageScale},1920)':h='min(ih*${imageScale},1080)':force_original_aspect_ratio=decrease[scaled];`;
      
      // 画像を動画にオーバーレイ
      filterComplex += '[0:v][scaled]overlay=x=(W-w)/2:y=(H-h)/2[composite];';
      
      // カラーフィルターを適用（元の実装に戻す）
      if (filterOpacity > 0) {
        // カラーを16進数からRGBに変換
        const r = parseInt(filterColor.substr(1, 2), 16);
        const g = parseInt(filterColor.substr(3, 2), 16);
        const b = parseInt(filterColor.substr(5, 2), 16);
        
        // colorchannelmixerを使用（元の実装）
        const rNorm = r / 255;
        const gNorm = g / 255;
        const bNorm = b / 255;
        
        // filterOpacityは既に0-1の範囲
        const opacity = filterOpacity;
        
        // 色相と透明度を調整
        const rr = 1 - opacity + rNorm * opacity;
        const gg = 1 - opacity + gNorm * opacity;
        const bb = 1 - opacity + bNorm * opacity;
        
        filterComplex += `[composite]colorchannelmixer=rr=${rr}:gg=${gg}:bb=${bb}[outv]`;
        console.log('✅ カラーフィルター適用:', filterColor, '透明度:', (opacity * 100).toFixed(0) + '%');
      } else {
        filterComplex += '[composite]copy[outv]';
        console.log('⏭️ フィルターをスキップ（透明度が0）');
      }
      
      // フィルターチェーンをログ出力
      console.log('📐 最終フィルターチェーン:', filterComplex);
      ff.complexFilter(filterComplex);
      
      // 出力設定
      ff.outputOptions([
          '-map', '[outv]',
          '-map', '1:a',
          '-c:v', 'libx264',
          '-c:a', 'copy',          // 音声は再エンコードしない
          '-preset', 'ultrafast',  // 最速プリセット
          '-crf', '28',            // 品質を下げて高速化
          '-pix_fmt', 'yuv420p',
          '-threads', '2',         // スレッド数を減らして安定化
          '-max_muxing_queue_size', '1024',
          '-shortest',             // 最短の入力に合わせる
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
            console.log(`⏳ 進行状況: ${Math.round(progress.percent)}% | 時間: ${progress.timemark || 'N/A'} | 速度: ${progress.currentKbps || 'N/A'} kbps`);
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
        
      // タイムアウト設定（5分）
      const timeout = setTimeout(() => {
        console.error('⏱️ タイムアウト: 5分経過したため処理を中止します');
        ff.kill('SIGKILL');
        reject(new Error('動画処理がタイムアウトしました（5分経過）'));
      }, 300000);
      
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