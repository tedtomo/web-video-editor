#!/bin/bash

# Google設定をJSON文字列に変換するスクリプト

CONFIG_FILE="config/google-config.json"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ エラー: $CONFIG_FILE が見つかりません"
    exit 1
fi

# JSONを1行に圧縮
JSON_STRING=$(cat "$CONFIG_FILE" | jq -c .)

echo "🔧 Renderの環境変数に以下を設定してください："
echo ""
echo "変数名: GOOGLE_CONFIG"
echo "値:"
echo "$JSON_STRING"
echo ""
echo "📋 コピー用（ダブルクォートなし）："
echo "$JSON_STRING" | sed 's/"/\\"/g'