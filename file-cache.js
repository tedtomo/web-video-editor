const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

class FileCache {
  constructor(cacheDir = path.join(__dirname, 'cache')) {
    this.cacheDir = cacheDir;
    this.cacheIndex = new Map();
    this.maxCacheSize = 5 * 1024 * 1024 * 1024; // 5GB
    this.maxFileAge = 24 * 60 * 60 * 1000; // 24時間
    fs.ensureDirSync(this.cacheDir);
    this.loadCacheIndex();
  }

  // URLからキャッシュキーを生成
  generateCacheKey(url) {
    return crypto.createHash('md5').update(url).digest('hex');
  }

  // キャッシュインデックスを読み込み
  async loadCacheIndex() {
    const indexPath = path.join(this.cacheDir, 'cache-index.json');
    if (await fs.pathExists(indexPath)) {
      try {
        const data = await fs.readJson(indexPath);
        this.cacheIndex = new Map(Object.entries(data));
      } catch (error) {
        console.error('キャッシュインデックス読み込みエラー:', error);
        this.cacheIndex = new Map();
      }
    }
  }

  // キャッシュインデックスを保存
  async saveCacheIndex() {
    const indexPath = path.join(this.cacheDir, 'cache-index.json');
    const data = Object.fromEntries(this.cacheIndex);
    await fs.writeJson(indexPath, data, { spaces: 2 });
  }

  // ファイルがキャッシュに存在するか確認
  async has(url) {
    const key = this.generateCacheKey(url);
    const entry = this.cacheIndex.get(key);
    
    if (!entry) return false;
    
    const filePath = path.join(this.cacheDir, entry.filename);
    if (!(await fs.pathExists(filePath))) {
      this.cacheIndex.delete(key);
      await this.saveCacheIndex();
      return false;
    }
    
    // ファイルの有効期限をチェック
    const age = Date.now() - entry.timestamp;
    if (age > this.maxFileAge) {
      await this.remove(url);
      return false;
    }
    
    return true;
  }

  // キャッシュからファイルパスを取得
  async get(url) {
    const key = this.generateCacheKey(url);
    const entry = this.cacheIndex.get(key);
    
    if (!entry || !(await this.has(url))) {
      return null;
    }
    
    // アクセス時刻を更新
    entry.lastAccessed = Date.now();
    await this.saveCacheIndex();
    
    return path.join(this.cacheDir, entry.filename);
  }

  // ファイルをキャッシュに追加
  async put(url, sourcePath, originalFilename) {
    const key = this.generateCacheKey(url);
    const ext = path.extname(originalFilename);
    const cacheFilename = `${key}${ext}`;
    const cachePath = path.join(this.cacheDir, cacheFilename);
    
    // ファイルをコピー
    await fs.copy(sourcePath, cachePath);
    
    // インデックスに追加
    const stats = await fs.stat(cachePath);
    this.cacheIndex.set(key, {
      url,
      filename: cacheFilename,
      originalFilename,
      size: stats.size,
      timestamp: Date.now(),
      lastAccessed: Date.now()
    });
    
    await this.saveCacheIndex();
    await this.cleanupIfNeeded();
    
    return cachePath;
  }

  // キャッシュからファイルを削除
  async remove(url) {
    const key = this.generateCacheKey(url);
    const entry = this.cacheIndex.get(key);
    
    if (entry) {
      const filePath = path.join(this.cacheDir, entry.filename);
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
      }
      this.cacheIndex.delete(key);
      await this.saveCacheIndex();
    }
  }

  // キャッシュサイズをチェックして必要に応じてクリーンアップ
  async cleanupIfNeeded() {
    let totalSize = 0;
    const entries = Array.from(this.cacheIndex.values());
    
    // 合計サイズを計算
    for (const entry of entries) {
      totalSize += entry.size;
    }
    
    if (totalSize <= this.maxCacheSize) return;
    
    // 最終アクセス時刻でソート（古い順）
    entries.sort((a, b) => a.lastAccessed - b.lastAccessed);
    
    // 古いファイルから削除
    for (const entry of entries) {
      if (totalSize <= this.maxCacheSize * 0.8) break; // 80%まで削減
      
      await this.remove(entry.url);
      totalSize -= entry.size;
    }
  }

  // キャッシュの統計情報を取得
  async getStats() {
    let totalSize = 0;
    let fileCount = 0;
    
    for (const entry of this.cacheIndex.values()) {
      totalSize += entry.size;
      fileCount++;
    }
    
    return {
      fileCount,
      totalSize,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
      maxSizeMB: (this.maxCacheSize / 1024 / 1024).toFixed(2),
      usagePercent: ((totalSize / this.maxCacheSize) * 100).toFixed(1)
    };
  }

  // 期限切れファイルをクリーンアップ
  async cleanupExpired() {
    const now = Date.now();
    const expiredUrls = [];
    
    for (const [key, entry] of this.cacheIndex.entries()) {
      const age = now - entry.timestamp;
      if (age > this.maxFileAge) {
        expiredUrls.push(entry.url);
      }
    }
    
    for (const url of expiredUrls) {
      await this.remove(url);
    }
    
    return expiredUrls.length;
  }
}

module.exports = FileCache;