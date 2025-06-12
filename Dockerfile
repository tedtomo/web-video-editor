FROM node:18-alpine

# FFmpegインストール
RUN apk add --no-cache ffmpeg

# 作業ディレクトリ設定
WORKDIR /app

# package.jsonとpackage-lock.jsonをコピー
COPY package*.json ./

# 依存関係インストール
RUN npm ci --only=production

# アプリケーションコードをコピー
COPY . .

# ディレクトリ作成
RUN mkdir -p uploads output

# ポート公開
EXPOSE 3003

# 環境変数設定
ENV PORT=3003

# アプリケーション起動
CMD ["node", "server.js"]