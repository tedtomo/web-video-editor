const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const VideoEditor = require('./video-editor');
// const SpreadsheetProcessor = require('./spreadsheet-processor'); // 公開リンク方式では不要

const app = express();
const PORT = process.env.PORT || 3003;

// タイムアウト設定を増やす（5分）
app.use((req, res, next) => {
  req.setTimeout(300000); // 5分
  res.setTimeout(300000); // 5分
  next();
});

// Renderのヘルスチェック対応
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// ミドルウェア
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ディレクトリ初期化
const uploadsDir = path.join(__dirname, 'uploads');
const outputDir = path.join(__dirname, 'output');
fs.ensureDirSync(uploadsDir);
fs.ensureDirSync(outputDir);

// ファイルアップロード設定
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    // ファイル名をBufferでデコード（文字化け対策）
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(originalName);
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${ext}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB制限
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|mp3|wav|m4a|aac|ogg|flac|webm/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/');
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('対応していないファイル形式です'));
    }
  }
});

// 動画編集エンジン
const videoEditor = new VideoEditor();

// ルート
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ファイルアップロード
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'ファイルが選択されていません' });
    }

    console.log('📤 ファイルアップロード:', {
      name: req.file.originalname,
      type: req.file.mimetype,
      size: req.file.size
    });

    // ファイル名をUTF-8でデコード
    const decodedName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    
    res.json({
      success: true,
      filename: req.file.filename,
      originalName: decodedName,
      size: req.file.size,
      type: req.file.mimetype,
      url: `/uploads/${req.file.filename}`
    });

  } catch (error) {
    console.error('❌ アップロードエラー:', error);
    res.status(500).json({ error: error.message });
  }
});

// 複数ファイルアップロード
app.post('/api/upload-multiple', upload.fields([
  { name: 'backgroundVideo', maxCount: 1 },
  { name: 'image', maxCount: 1 },
  { name: 'audio', maxCount: 1 }
]), (req, res) => {
  try {
    const files = {};
    
    if (req.files.backgroundVideo) {
      files.backgroundVideo = {
        filename: req.files.backgroundVideo[0].filename,
        originalName: req.files.backgroundVideo[0].originalname,
        url: `/uploads/${req.files.backgroundVideo[0].filename}`
      };
    }
    
    if (req.files.image) {
      files.image = {
        filename: req.files.image[0].filename,
        originalName: req.files.image[0].originalname,
        url: `/uploads/${req.files.image[0].filename}`
      };
    }
    
    if (req.files.audio) {
      files.audio = {
        filename: req.files.audio[0].filename,
        originalName: req.files.audio[0].originalname,
        url: `/uploads/${req.files.audio[0].filename}`
      };
    }

    res.json({
      success: true,
      files: files
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 動画編集実行
app.post('/api/edit-video', async (req, res) => {
  try {
    const {
      backgroundVideoFile,
      imageFile,
      audioFile,
      duration,
      videoStart = '0:00',
      audioStart = '0:00',
      outputName = `edited_${Date.now()}.mp4`,
      imageScale = 0.8,
      filterColor = '#000000',
      filterOpacity = 0
    } = req.body;

    // バリデーション
    if (!backgroundVideoFile || !imageFile || !audioFile || !duration) {
      return res.status(400).json({
        error: '必須パラメータが不足しています',
        required: ['backgroundVideoFile', 'imageFile', 'audioFile', 'duration']
      });
    }

    console.log('🎬 動画編集開始');
    console.log('設定:', JSON.stringify({ backgroundVideoFile, imageFile, audioFile, duration, videoStart, audioStart, outputName }, null, 2));

    // ファイルパス構築
    const backgroundVideoPath = path.join(uploadsDir, backgroundVideoFile);
    const imagePath = path.join(uploadsDir, imageFile);
    const audioPath = path.join(uploadsDir, audioFile);

    // ファイル存在確認
    const missingFiles = [];
    if (!fs.existsSync(backgroundVideoPath)) {
      missingFiles.push(`背景動画: ${backgroundVideoPath}`);
    }
    if (!fs.existsSync(imagePath)) {
      missingFiles.push(`画像: ${imagePath}`);
    }
    if (!fs.existsSync(audioPath)) {
      missingFiles.push(`音声: ${audioPath}`);
    }
    
    if (missingFiles.length > 0) {
      console.error('❌ ファイルが見つかりません:', missingFiles);
      return res.status(400).json({ 
        error: 'アップロードされたファイルが見つかりません',
        missingFiles: missingFiles 
      });
    }
    
    console.log('✅ ファイル確認完了');

    // 動画編集実行
    const result = await videoEditor.createCompositeVideo({
      backgroundVideoPath,
      imagePath,
      audioPath,
      duration: videoEditor.parseTimeToSeconds(duration),
      videoStart: videoEditor.parseTimeToSeconds(videoStart),
      audioStart: videoEditor.parseTimeToSeconds(audioStart),
      outputName,
      imageScale,
      filterColor,
      filterOpacity
    });

    res.json({
      success: true,
      message: '動画編集が完了しました',
      outputFile: result.filename,
      outputUrl: result.url,
      outputPath: result.path
    });

  } catch (error) {
    console.error('❌ 動画編集エラー:', error);
    console.error('スタックトレース:', error.stack);
    
    // レスポンスが既に送信されているかチェック
    if (!res.headersSent) {
      res.status(500).json({ 
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined 
      });
    }
  }
});

// 出力動画リスト
app.get('/api/videos', async (req, res) => {
  try {
    const files = await fs.readdir(outputDir);
    const videos = files.filter(file => file.endsWith('.mp4'));
    
    const videoList = await Promise.all(
      videos.map(async (filename) => {
        const filePath = path.join(outputDir, filename);
        const stats = await fs.stat(filePath);
        return {
          filename,
          size: Math.round(stats.size / (1024 * 1024) * 100) / 100, // MB
          created: stats.mtime,
          url: `/output/${filename}`
        };
      })
    );

    res.json(videoList.sort((a, b) => b.created - a.created));

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 静的ファイル配信
app.use('/uploads', express.static(uploadsDir));
app.use('/output', express.static(outputDir));

// Google設定の読み込み
let googleConfig = null;

// 環境変数から設定を読み込む（Render用）
console.log('🔍 環境変数GOOGLE_CONFIGの存在確認:', !!process.env.GOOGLE_CONFIG);
console.log('🔍 環境変数の長さ:', process.env.GOOGLE_CONFIG?.length || 0);
if (process.env.GOOGLE_CONFIG) {
  try {
    let configString = process.env.GOOGLE_CONFIG;
    
    // Base64エンコードされているかチェック
    if (!configString.startsWith('{')) {
      console.log('🔍 Base64エンコードされた設定を検出');
      // Base64デコード
      configString = Buffer.from(configString, 'base64').toString('utf-8');
      console.log('🔍 デコード後の最初の200文字:', configString.substring(0, 200));
    } else {
      console.log('🔍 JSON文字列の最初の200文字:', configString.substring(0, 200));
      console.log('🔍 JSON文字列の最後の100文字:', configString.substring(configString.length - 100));
      
      // Renderの環境変数の改行を処理
      // 1. まず全ての実際の改行を特殊文字に置換
      let cleanedConfig = configString
        .replace(/\r\n/g, '__NEWLINE__')
        .replace(/\n/g, '__NEWLINE__')
        .replace(/\r/g, '__NEWLINE__');
      
      // 2. 特殊文字を削除（JSON内の文字列リテラル\\nは保持される）
      configString = cleanedConfig.replace(/__NEWLINE__/g, '');
      
      console.log('🔍 クリーニング後の最初の200文字:', configString.substring(0, 200));
    }
    
    googleConfig = JSON.parse(configString);
    
    // private_keyの改行文字を確実に処理
    if (googleConfig.credentials && googleConfig.credentials.private_key) {
      // private_keyに含まれる\\nを実際の改行に変換
      googleConfig.credentials.private_key = googleConfig.credentials.private_key.replace(/\\n/g, '\n');
      
      // 他のフィールドの余分な空白も除去
      if (googleConfig.credentials.type) {
        googleConfig.credentials.type = googleConfig.credentials.type.trim();
      }
      if (googleConfig.credentials.client_email) {
        googleConfig.credentials.client_email = googleConfig.credentials.client_email.trim();
      }
    }
    console.log('✅ 環境変数からGoogle設定を読み込みました');
    console.log('📋 読み込んだ設定:', {
      spreadsheetId: googleConfig.spreadsheetId,
      hasCredentials: !!googleConfig.credentials,
      driveFolderId: googleConfig.driveFolderId
    });
  } catch (error) {
    console.error('❌ 環境変数のGoogle設定パースエラー:', error.message);
    console.error('❌ エラー詳細:', error.stack);
    console.error('❌ 設定値の最初の200文字:', process.env.GOOGLE_CONFIG?.substring(0, 200));
    console.error('❌ 設定値の最後の100文字:', process.env.GOOGLE_CONFIG?.substring(process.env.GOOGLE_CONFIG.length - 100));
    
    // 手動で問題を特定
    const envValue = process.env.GOOGLE_CONFIG;
    console.error('❌ 不正な文字チェック:');
    console.error('- 開始文字:', envValue.charCodeAt(0), '(', envValue[0], ')');
    console.error('- 終了文字:', envValue.charCodeAt(envValue.length - 1), '(', envValue[envValue.length - 1], ')');
    
    // 簡単な修正を試す
    try {
      // 同じクリーニング処理を適用
      let cleanedValue = envValue
        .replace(/\r\n/g, '__NEWLINE__')
        .replace(/\n/g, '__NEWLINE__')
        .replace(/\r/g, '__NEWLINE__');
      
      cleanedValue = cleanedValue.replace(/__NEWLINE__/g, '').trim();
      
      console.log('🔍 リトライ時のクリーニング後:', cleanedValue.substring(0, 200));
      
      const testConfig = JSON.parse(cleanedValue);
      
      // private_keyの改行文字を確実に処理
      if (testConfig.credentials && testConfig.credentials.private_key) {
        testConfig.credentials.private_key = testConfig.credentials.private_key.replace(/\\n/g, '\n');
        
        // 他のフィールドの余分な空白も除去
        if (testConfig.credentials.type) {
          testConfig.credentials.type = testConfig.credentials.type.trim();
        }
        if (testConfig.credentials.client_email) {
          testConfig.credentials.client_email = testConfig.credentials.client_email.trim();
        }
      }
      
      console.log('✅ trim()後のパースに成功しました');
      googleConfig = testConfig;
    } catch (retryError) {
      console.error('❌ trim()後もパースに失敗:', retryError.message);
    }
  }
} else {
  console.log('⚠️ 環境変数GOOGLE_CONFIGが設定されていません');
}

// 環境変数にない場合は設定ファイルから読み込む
if (!googleConfig) {
  const configPath = path.join(__dirname, 'config', 'google-config.json');
  if (fs.existsSync(configPath)) {
    try {
      googleConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      console.log('✅ Google設定ファイルを読み込みました');
    } catch (error) {
      console.error('❌ Google設定ファイルの読み込みエラー:', error);
    }
  }
}


// 設定を取得するエンドポイント
app.get('/api/google-config', (req, res) => {
  console.log('🔍 /api/google-config called, googleConfig exists:', !!googleConfig);
  
  if (googleConfig) {
    // 機密情報を一部マスクして返す
    const maskedConfig = {
      ...googleConfig,
      credentials: {
        ...googleConfig.credentials,
        private_key: '***HIDDEN***',
        private_key_id: '***HIDDEN***'
      }
    };
    res.json({ exists: true, config: maskedConfig });
  } else {
    const debug = {
      hasEnvVar: !!process.env.GOOGLE_CONFIG,
      envVarLength: process.env.GOOGLE_CONFIG ? process.env.GOOGLE_CONFIG.length : 0,
      configFileExists: require('fs').existsSync(require('path').join(__dirname, 'config', 'google-config.json'))
    };
    console.log('❌ googleConfig is null, debug info:', debug);
    res.json({ 
      exists: false,
      debug
    });
  }
});

// デバッグ用エンドポイント（一時的）
app.get('/api/debug-config', (req, res) => {
  res.json({
    hasGoogleConfig: !!googleConfig,
    hasEnvVar: !!process.env.GOOGLE_CONFIG,
    envVarLength: process.env.GOOGLE_CONFIG ? process.env.GOOGLE_CONFIG.length : 0,
    envVarFirstChars: process.env.GOOGLE_CONFIG ? process.env.GOOGLE_CONFIG.substring(0, 50) + '...' : null,
    configFileExists: require('fs').existsSync(require('path').join(__dirname, 'config', 'google-config.json')),
    nodeEnv: process.env.NODE_ENV,
    platform: process.platform
  });
});

// 設定を保存するエンドポイント（Render環境用）
app.post('/api/google-config', async (req, res) => {
  try {
    const newConfig = req.body;
    
    // 設定を検証
    if (!newConfig.spreadsheetId || !newConfig.credentials) {
      return res.status(400).json({ error: '必須フィールドが不足しています' });
    }
    
    // メモリに保存（Render環境では再起動時に消える）
    googleConfig = newConfig;
    
    // 可能であればファイルにも保存
    const configDir = path.join(__dirname, 'config');
    const configPath = path.join(configDir, 'google-config.json');
    
    try {
      await fs.ensureDir(configDir);
      await fs.writeJson(configPath, newConfig, { spaces: 2 });
      console.log('✅ Google設定をファイルに保存しました');
    } catch (error) {
      console.log('⚠️ ファイルへの保存は失敗しましたが、メモリには保存されています');
    }
    
    res.json({ success: true, message: '設定を保存しました' });
  } catch (error) {
    console.error('設定保存エラー:', error);
    res.status(500).json({ error: error.message });
  }
});

// 新しい公開スプレッドシート連携エンドポイント（認証不要）
app.post('/api/spreadsheet-sync-public', async (req, res) => {
  try {
    const { spreadsheetId, sheetName = null } = req.body;

    if (!spreadsheetId) {
      return res.status(400).json({
        error: 'spreadsheetIdは必須です'
      });
    }

    console.log('🚀 公開スプレッドシート処理開始');
    console.log('📋 スプレッドシートID:', spreadsheetId);
    console.log('📋 シート名:', sheetName || '最初のシート');

    // 公開スプレッドシート専用プロセッサーを直接使用
    const PublicSheetsIntegration = require('./public-sheets-integration');
    const publicIntegration = new PublicSheetsIntegration();

    // データを取得
    const executionRows = await publicIntegration.getExecutionRows(spreadsheetId, sheetName);

    if (executionRows.length === 0) {
      return res.json({
        success: true,
        message: '実行対象の行（○マーク）がありません',
        totalRows: 0,
        results: []
      });
    }

    console.log(`✅ ${executionRows.length}件の実行対象行を発見`);

    res.json({
      success: true,
      message: `${executionRows.length}件の処理対象が見つかりました（実際の動画処理は後で実装します）`,
      totalRows: executionRows.length,
      results: executionRows.map(row => ({
        rowIndex: row.rowIndex,
        outputFileName: row.outputFileName,
        hasImage: !!row.imageUrl,
        hasVideo: !!row.videoUrl,
        hasAudio: !!row.audioUrl
      }))
    });

  } catch (error) {
    console.error('公開スプレッドシート連携エラー:', error);
    res.status(500).json({ error: error.message });
  }
});

// スプレッドシート連携エンドポイント（公開リンク方式に変更）
app.post('/api/spreadsheet-sync', async (req, res) => {
  try {
    const { 
      spreadsheetId = googleConfig?.spreadsheetId,
      sheetName = null
    } = req.body;

    if (!spreadsheetId) {
      return res.status(400).json({
        error: 'spreadsheetIdは必須です'
      });
    }

    console.log('🚀 公開スプレッドシート処理開始（メインエンドポイント）');
    console.log('📋 スプレッドシートID:', spreadsheetId);
    console.log('📋 シート名:', sheetName || '最初のシート');

    // 公開スプレッドシート専用プロセッサーを直接使用
    const PublicSheetsIntegration = require('./public-sheets-integration');
    const publicIntegration = new PublicSheetsIntegration();

    // データを取得
    const executionRows = await publicIntegration.getExecutionRows(spreadsheetId, sheetName);

    if (executionRows.length === 0) {
      return res.json({
        success: true,
        message: '実行対象の行（○マーク）がありません',
        totalRows: 0,
        results: []
      });
    }

    console.log(`✅ ${executionRows.length}件の実行対象行を発見`);

    // 即座にレスポンスを返す（非同期処理開始）
    res.json({
      success: true,
      message: `${executionRows.length}件の動画処理を開始しました。処理完了まで数分お待ちください。`,
      totalRows: executionRows.length,
      processing: true,
      results: executionRows.map(row => ({
        rowIndex: row.rowIndex,
        outputFileName: row.outputFileName,
        status: 'processing'
      }))
    });

    // バックグラウンドで動画処理を実行
    setImmediate(async () => {
      try {
        const processor = require('./spreadsheet-processor');
        const processorInstance = new processor();
        await processorInstance.initialize();

        console.log('🎬 バックグラウンドで動画処理を開始します...');
        const result = await processorInstance.processSpreadsheet(spreadsheetId, { sheetName });
        
        console.log('🎉 全ての動画処理が完了しました:', result);
      } catch (error) {
        console.error('❌ バックグラウンド処理エラー:', error);
      }
    });

  } catch (error) {
    console.error('公開スプレッドシート連携エラー:', error);
    res.status(500).json({ error: error.message });
  }
});

// スプレッドシート定期処理の開始エンドポイント（公開リンク方式では無効化）
app.post('/api/spreadsheet-sync/start-periodic', async (req, res) => {
  res.json({
    success: false,
    message: '公開リンク方式では定期処理は無効化されています。手動で実行してください。'
  });
});

// サーバー起動
app.listen(PORT, async () => {
  console.log('🚀 Web Video Editor Started');
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log('📁 Uploads:', uploadsDir);
  console.log('📹 Output:', outputDir);
  console.log('🔄 Version: 2024-12-06-v5 (Japanese UI + Debug logs)');
  console.log(`📅 Deployed at: ${new Date().toISOString()}`);
  console.log('✅ Server is ready to accept requests');

  // 自動処理は無効化（公開リンク方式では手動実行のみ）
  console.log('ℹ️ 自動処理は公開リンク方式では無効化されています');
});