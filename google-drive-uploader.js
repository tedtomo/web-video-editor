const { google } = require('googleapis');
const fs = require('fs-extra');
const path = require('path');

class GoogleDriveUploader {
  constructor() {
    this.auth = null;
    this.drive = null;
  }

  async initialize() {
    try {
      // 環境変数からGoogle認証情報を取得
      const googleConfigString = process.env.GOOGLE_CONFIG;
      if (!googleConfigString) {
        throw new Error('GOOGLE_CONFIG環境変数が設定されていません');
      }

      // Base64デコード
      let configString = googleConfigString;
      if (!configString.startsWith('{')) {
        configString = Buffer.from(configString, 'base64').toString('utf-8');
      }

      const credentials = JSON.parse(configString);

      // 認証設定
      const { GoogleAuth } = require('google-auth-library');
      this.auth = new GoogleAuth({
        credentials: credentials,
        scopes: ['https://www.googleapis.com/auth/drive.file']
      });

      const authClient = await this.auth.getClient();
      this.drive = google.drive({ version: 'v3', auth: authClient });

      console.log('✅ Google Drive 認証完了');
    } catch (error) {
      console.error('❌ Google Drive 認証エラー:', error.message);
      throw error;
    }
  }

  async uploadVideo(filePath, fileName) {
    try {
      if (!this.drive) {
        await this.initialize();
      }

      const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
      if (!folderId) {
        throw new Error('GOOGLE_DRIVE_FOLDER_ID環境変数が設定されていません');
      }

      console.log(`📤 Google Driveにアップロード中: ${fileName}`);

      // ファイルメタデータ
      const fileMetadata = {
        name: fileName,
        parents: [folderId]
      };

      // ファイルをストリームで読み込み
      const media = {
        mimeType: 'video/mp4',
        body: fs.createReadStream(filePath)
      };

      // アップロード実行
      const response = await this.drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id,name,webViewLink,webContentLink'
      });

      // 共有設定（リンクを知っている全員が閲覧可能）
      await this.drive.permissions.create({
        fileId: response.data.id,
        requestBody: {
          role: 'reader',
          type: 'anyone'
        }
      });

      // 直接再生可能なリンクを生成
      const directLink = `https://drive.google.com/file/d/${response.data.id}/view`;
      
      console.log(`✅ Google Driveアップロード完了: ${directLink}`);

      return {
        id: response.data.id,
        name: response.data.name,
        webViewLink: response.data.webViewLink,
        directLink: directLink,
        success: true
      };

    } catch (error) {
      console.error('❌ Google Driveアップロードエラー:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // アップロード後にローカルファイルを削除（オプション）
  async uploadAndCleanup(filePath, fileName) {
    try {
      const result = await this.uploadVideo(filePath, fileName);
      
      if (result.success) {
        // アップロード成功したらローカルファイルを削除
        await fs.remove(filePath);
        console.log(`🗑️ ローカルファイルを削除: ${fileName}`);
      }
      
      return result;
    } catch (error) {
      console.error('❌ アップロード＆クリーンアップエラー:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = GoogleDriveUploader;