const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

class SimpleDriveDownloader {
  // Google DriveのURLを直接ダウンロード可能なURLに変換
  convertToDownloadUrl(driveUrl) {
    // ファイルIDを抽出
    let fileId = '';
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9-_]+)/,
      /\/folders\/([a-zA-Z0-9-_]+)/,
      /id=([a-zA-Z0-9-_]+)/,
      /\/d\/([a-zA-Z0-9-_]+)/,
      /^([a-zA-Z0-9-_]+)$/
    ];

    for (const pattern of patterns) {
      const match = driveUrl.match(pattern);
      if (match) {
        fileId = match[1];
        break;
      }
    }

    if (!fileId) {
      throw new Error(`ファイルIDを抽出できませんでした: ${driveUrl}`);
    }

    // 直接ダウンロード用のURLを生成
    // 小さいファイル用
    const directUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    // 大きいファイル用（確認ページをスキップ）
    const confirmUrl = `https://drive.google.com/uc?export=download&confirm=t&id=${fileId}`;
    
    return { fileId, directUrl, confirmUrl };
  }

  // URLから直接ファイルをダウンロード
  async downloadFile(url, outputPath) {
    try {
      console.log(`ダウンロード開始: ${url}`);
      
      // まず通常のURLでダウンロードを試みる
      const { directUrl, confirmUrl, fileId } = this.convertToDownloadUrl(url);
      
      try {
        // 小さいファイルの場合
        const response = await axios({
          method: 'GET',
          url: directUrl,
          responseType: 'stream',
          maxRedirects: 5,
          timeout: 300000, // 5分
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        // ウイルススキャンの警告ページかチェック
        const contentType = response.headers['content-type'];
        if (contentType && contentType.includes('text/html')) {
          console.log('確認ページを検出、大きいファイル用URLで再試行...');
          throw new Error('NEED_CONFIRM');
        }

        // ファイルを保存
        await this.saveStream(response.data, outputPath);
        console.log(`ダウンロード完了: ${outputPath}`);
        return outputPath;
        
      } catch (error) {
        if (error.message === 'NEED_CONFIRM' || error.response?.status === 403) {
          // 大きいファイル用のURLで再試行
          console.log('確認付きURLで再試行中...');
          const response = await axios({
            method: 'GET',
            url: confirmUrl,
            responseType: 'stream',
            maxRedirects: 5,
            timeout: 300000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });

          await this.saveStream(response.data, outputPath);
          console.log(`ダウンロード完了: ${outputPath}`);
          return outputPath;
        }
        throw error;
      }
    } catch (error) {
      console.error('ダウンロードエラー:', error.message);
      
      // より詳しいエラーメッセージ
      if (error.response) {
        if (error.response.status === 404) {
          throw new Error(`ファイルが見つかりません。URLを確認してください: ${url}`);
        } else if (error.response.status === 403) {
          throw new Error(`アクセスが拒否されました。ファイルの共有設定を「リンクを知っている全員」に変更してください: ${url}`);
        }
      }
      
      throw new Error(`ダウンロードに失敗しました: ${error.message}`);
    }
  }

  // ストリームをファイルに保存
  async saveStream(stream, outputPath) {
    await fs.ensureDir(path.dirname(outputPath));
    
    return new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(outputPath);
      
      stream.pipe(writer);
      
      writer.on('finish', () => {
        resolve(outputPath);
      });
      
      writer.on('error', (error) => {
        reject(error);
      });
      
      stream.on('error', (error) => {
        writer.destroy();
        reject(error);
      });
    });
  }

  // 複数のファイルを並行ダウンロード
  async downloadMultiple(downloads) {
    const results = await Promise.allSettled(
      downloads.map(({ url, outputPath }) => 
        this.downloadFile(url, outputPath)
      )
    );

    const errors = [];
    const success = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        success.push({
          url: downloads[index].url,
          path: result.value
        });
      } else {
        errors.push({
          url: downloads[index].url,
          error: result.reason.message
        });
      }
    });

    return { success, errors };
  }
}

module.exports = SimpleDriveDownloader;