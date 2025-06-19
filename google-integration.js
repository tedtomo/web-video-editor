const { google } = require('googleapis');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

class GoogleIntegration {
  constructor() {
    this.sheets = null;
    this.drive = null;
    this.auth = null;
  }

  // ファイル名をサニタイズ
  sanitizeFileName(fileName) {
    if (!fileName) return null;
    
    // 拡張子を確認
    const ext = fileName.match(/\.[^.]*$/)?.[0]?.toLowerCase() || '';
    const validVideoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv'];
    
    // 無効な拡張子の場合は.mp4に修正
    if (!validVideoExtensions.includes(ext)) {
      const baseName = fileName.replace(/\.[^.]*$/, ''); // 既存の拡張子を削除
      return `${baseName}.mp4`;
    }
    
    return fileName;
  }

  // 認証初期化
  async initialize(credentials) {
    try {
      console.log('🔐 Google認証初期化開始');
      console.log('📋 認証タイプ:', credentials.type);
      console.log('📧 クライアントメール:', credentials.client_email);
      console.log('🔑 プライベートキーの最初の50文字:', credentials.private_key?.substring(0, 50) + '...');
      
      // サービスアカウントまたはOAuth2認証を使用
      // typeフィールドの空白を除去して比較
      const authType = credentials.type?.trim();
      console.log('🔍 認証タイプ（トリム後）:', authType);
      
      if (authType === 'service_account') {
        // JWT認証の正しい形式
        this.auth = new google.auth.JWT(
          credentials.client_email,
          null,
          credentials.private_key,
          [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive.file',
            'https://www.googleapis.com/auth/drive.readonly'
          ]
        );
      } else {
        // OAuth2認証の場合
        const oauth2Client = new google.auth.OAuth2(
          credentials.client_id,
          credentials.client_secret,
          credentials.redirect_uri
        );
        oauth2Client.setCredentials(credentials.tokens);
        this.auth = oauth2Client;
      }

      // JWTの場合、認証を実行
      if (authType === 'service_account') {
        console.log('🔑 サービスアカウント認証を実行中...');
        console.log('🔍 authオブジェクトの確認:', !!this.auth);
        console.log('🔍 authorizeメソッドの存在:', typeof this.auth.authorize);
        
        try {
          const authClient = await this.auth.authorize();
          console.log('✅ 認証成功');
          console.log('🔍 認証結果:', !!authClient);
          
          // 認証結果があればそれを使用
          if (authClient) {
            this.auth = authClient;
          }
        } catch (authError) {
          console.error('❌ 認証エラー:', authError);
          console.error('❌ エラー詳細:', authError.stack);
          
          // access_tokenエラーの場合、プライベートキーの問題の可能性
          if (authError.message && authError.message.includes('access_token')) {
            console.error('❌ プライベートキーが正しくフォーマットされていない可能性があります');
            console.error('❌ キーの改行文字を確認してください');
          }
          
          throw new Error(`Google認証に失敗しました: ${authError.message}`);
        }
      }
      
      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
      this.drive = google.drive({ version: 'v3', auth: this.auth });
    } catch (error) {
      console.error('Google API初期化エラー:', error);
      throw error;
    }
  }

  // スプレッドシートから実行対象の行を取得
  async getExecutionRows(spreadsheetId, range = 'A:L') {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range
      });

      const rows = response.data.values;
      if (!rows || rows.length < 2) {
        return [];
      }

      // ヘッダー行を取得
      const headers = rows[0];
      const dataRows = rows.slice(1);

      // 実行対象の行をフィルタリング
      const executionRows = [];
      dataRows.forEach((row, index) => {
        if (row[0] === '○' || row[0] === 'o' || row[0] === 'O') {
          console.log(`\n行${index + 2}のデータ:`, row);
          const rowData = {
            rowIndex: index + 2, // スプレッドシートの行番号（1ベース、ヘッダー行を除く）
            imageUrl: row[1] || '',
            videoUrl: row[2] || '',
            audioUrl: row[3] || '',
            duration: parseInt(row[4]) || 20,
            outputFileName: this.sanitizeFileName(row[5]) || `output_${uuidv4()}.mp4`,
            videoStartTime: row[6] || '0:00',
            audioStartTime: row[7] || '0:00',
            imageScale: parseInt(row[8]) || 100,
            filterColor: row[9] || '#000000',
            filterOpacity: parseInt(row[10]) || 0,
            outputVideoUrl: row[11] || ''
          };
          console.log('パース後のデータ:', rowData);
          executionRows.push(rowData);
        }
      });

      return executionRows;
    } catch (error) {
      console.error('スプレッドシート読み取りエラー:', error);
      throw error;
    }
  }

  // Google DriveのURLからファイルをダウンロード
  async downloadFromDrive(fileUrl, outputPath) {
    try {
      // URLをデコード（日本語などのエンコードされた文字を処理）
      const decodedUrl = decodeURIComponent(fileUrl);
      
      // Google DriveのファイルIDを抽出
      let fileId = '';
      const patterns = [
        /\/file\/d\/([a-zA-Z0-9-_]+)/,
        /\/folders\/([a-zA-Z0-9-_]+)/,
        /id=([a-zA-Z0-9-_]+)/,
        /\/d\/([a-zA-Z0-9-_]+)/,
        /^([a-zA-Z0-9-_]+)$/  // IDのみの場合
      ];

      for (const pattern of patterns) {
        const match = decodedUrl.match(pattern);
        if (match) {
          fileId = match[1];
          break;
        }
      }

      if (!fileId) {
        console.error('URLから抽出できませんでした:', fileUrl);
        throw new Error(`Google DriveのファイルIDを抽出できませんでした: ${fileUrl}`);
      }

      console.log(`ファイルIDを抽出: ${fileId} (元URL: ${fileUrl})`);

      // ファイルの共有設定を確認（エラーをより詳しく）
      try {
        const fileInfo = await this.drive.files.get({
          fileId: fileId,
          fields: 'name, mimeType, size'
        });
        console.log(`ファイル情報: ${fileInfo.data.name} (${fileInfo.data.mimeType})`);
      } catch (error) {
        if (error.code === 404) {
          throw new Error(`ファイルが見つかりません（ID: ${fileId}）。共有設定を確認してください。`);
        } else if (error.code === 403) {
          throw new Error(`ファイルへのアクセス権限がありません（ID: ${fileId}）。サービスアカウントと共有されているか確認してください。`);
        }
        throw error;
      }

      // ファイルをダウンロード
      const destStream = fs.createWriteStream(outputPath);
      const response = await this.drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' }
      );

      return new Promise((resolve, reject) => {
        response.data
          .on('end', () => resolve(outputPath))
          .on('error', reject)
          .pipe(destStream);
      });
    } catch (error) {
      console.error('Google Driveダウンロードエラー:', error);
      throw error;
    }
  }

  // 動画をGoogle Driveにアップロード
  async uploadToDrive(filePath, fileName, folderId = null) {
    try {
      const fileMetadata = {
        name: fileName
      };

      if (folderId) {
        fileMetadata.parents = [folderId];
      }

      const media = {
        mimeType: 'video/mp4',
        body: fs.createReadStream(filePath)
      };

      const response = await this.drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, webViewLink'
      });

      // 共有設定を変更（リンクを知っている人が閲覧可能）
      await this.drive.permissions.create({
        fileId: response.data.id,
        requestBody: {
          role: 'reader',
          type: 'anyone'
        }
      });

      return response.data.webViewLink;
    } catch (error) {
      console.error('Google Driveアップロードエラー:', error);
      throw error;
    }
  }

  // スプレッドシートの特定のセルを更新
  async updateCell(spreadsheetId, range, value) {
    try {
      const response = await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [[value]]
        }
      });
      return response.data;
    } catch (error) {
      console.error('スプレッドシート更新エラー:', error);
      throw error;
    }
  }

  // 実行状態をクリア（○を消す）
  async clearExecutionFlag(spreadsheetId, rowIndex) {
    const range = `A${rowIndex}`;
    return await this.updateCell(spreadsheetId, range, '');
  }

  // 動画URLを記録
  async recordVideoUrl(spreadsheetId, rowIndex, videoUrl) {
    const range = `L${rowIndex}`;
    return await this.updateCell(spreadsheetId, range, videoUrl);
  }
}

module.exports = GoogleIntegration;