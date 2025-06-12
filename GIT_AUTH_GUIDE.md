# Git認証を簡単にする方法

## 🔐 Git認証のキャッシュ設定（設定済み）

以下のコマンドを実行済みです：
```bash
git config --global credential.helper 'cache --timeout=3600'
```

これにより、1時間（3600秒）の間、認証情報がキャッシュされます。

## 📝 より長期的な解決策

### 1. 認証情報を永続的に保存する（Linux/WSL）
```bash
git config --global credential.helper store
```

### 2. SSHキーを使用する（推奨）

#### SSHキーの生成
```bash
ssh-keygen -t ed25519 -C "your-email@example.com"
```

#### 公開鍵をGitHubに追加
1. 公開鍵をコピー：
   ```bash
   cat ~/.ssh/id_ed25519.pub
   ```
2. GitHub → Settings → SSH and GPG keys → New SSH key
3. 公開鍵を貼り付けて保存

#### リモートURLをSSHに変更
```bash
git remote set-url origin git@github.com:USERNAME/web-video-editor.git
```

## 🚀 現在の状況

- ✅ 認証情報は1時間キャッシュされます
- ✅ 次回のpush時は、ユーザー名とトークンの入力が不要です
- ⏰ 1時間後に再度入力が必要になります

## 📌 Personal Access Tokenの管理

トークンを安全に保管したい場合：
```bash
# 環境変数として設定
export GITHUB_TOKEN="your-token-here"

# pushする際に使用
git push https://$GITHUB_TOKEN@github.com/USERNAME/web-video-editor.git main
```