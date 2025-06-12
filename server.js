const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const VideoEditor = require('./video-editor');

const app = express();
const PORT = process.env.PORT || 3003;

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
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${path.extname(file.originalname)}`;
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

    res.json({
      success: true,
      filename: req.file.filename,
      originalName: req.file.originalname,
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
      outputName = `edited_${Date.now()}.mp4`
    } = req.body;

    // バリデーション
    if (!backgroundVideoFile || !imageFile || !audioFile || !duration) {
      return res.status(400).json({
        error: '必須パラメータが不足しています',
        required: ['backgroundVideoFile', 'imageFile', 'audioFile', 'duration']
      });
    }

    console.log('🎬 動画編集開始');
    console.log('設定:', { backgroundVideoFile, imageFile, audioFile, duration, videoStart, audioStart, outputName });

    // ファイルパス構築
    const backgroundVideoPath = path.join(uploadsDir, backgroundVideoFile);
    const imagePath = path.join(uploadsDir, imageFile);
    const audioPath = path.join(uploadsDir, audioFile);

    // ファイル存在確認
    if (!fs.existsSync(backgroundVideoPath) || !fs.existsSync(imagePath) || !fs.existsSync(audioPath)) {
      return res.status(400).json({ error: 'アップロードされたファイルが見つかりません' });
    }

    // 動画編集実行
    const result = await videoEditor.createCompositeVideo({
      backgroundVideoPath,
      imagePath,
      audioPath,
      duration: videoEditor.parseTimeToSeconds(duration),
      videoStart: videoEditor.parseTimeToSeconds(videoStart),
      audioStart: videoEditor.parseTimeToSeconds(audioStart),
      outputName
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
    res.status(500).json({ error: error.message });
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

// スプレッドシート連携エンドポイント（将来用）
app.post('/api/spreadsheet-sync', async (req, res) => {
  try {
    // TODO: 後でスプレッドシート連携機能を実装
    res.json({
      success: true,
      message: 'スプレッドシート連携機能は準備中です',
      data: req.body
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// サーバー起動
app.listen(PORT, () => {
  console.log('🚀 Web Video Editor Started');
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log('📁 Uploads:', uploadsDir);
  console.log('📹 Output:', outputDir);
  console.log('🔄 Version: 2024-12-06-v3 (Audio formats + Premium UI)');
  console.log(`📅 Deployed at: ${new Date().toISOString()}`);
});