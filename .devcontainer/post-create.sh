#!/bin/bash
set -e

echo "══════════════════════════════════════════════"
echo "  Platform Test Automation — Setting up..."
echo "══════════════════════════════════════════════"

echo ""
echo "[1/3] Installing project dependencies..."
npm install

echo ""
echo "[2/3] Installing MCP server dependencies..."
cd mcp-server && npm install && cd ..

echo ""
echo "[3/3] Preparing .env..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "  Created .env from template."
  echo "  ⚠️  Please edit .env and set OPENAI_API_KEY"
else
  echo "  .env already exists, skipping."
fi

echo ""
echo "══════════════════════════════════════════════"
echo "  ✅ Setup complete!"
echo ""
echo "  Usage: Open Copilot Chat (Cmd+Shift+I)"
echo "  Then say: 帮我分析后端最近的变更，生成测试"
echo "══════════════════════════════════════════════"
