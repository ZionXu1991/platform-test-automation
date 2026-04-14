# Platform Test Automation

VS Code Copilot + MCP 自动化 Cypress 测试。

**不需要 OpenAI API Key** — Copilot 本身就是 AI，负责生成测试代码。

---

## 工作原理

```
你说："帮我分析后端最近的变更，生成 Cypress 测试"

Copilot 自动执行：
  1. 调 analyze_diff   → 读 git diff，分类变更文件
  2. 调 get_prompt_template → 读测试模板
  3. Copilot 自己生成 Cypress 测试代码
  4. 调 save_test_file  → 写入 cypress/e2e/generated/
  5. 问你："要跑一下吗？"
  6. 调 run_tests       → 执行 Cypress，返回 pass/fail
```

---

## 安装

```bash
# 1. 安装项目依赖
npm install

# 2. 安装 MCP Server 依赖
cd mcp-server && npm install && cd ..

# 3. 配置环境
cp .env.example .env
# 编辑 .env：填入两个 repo 的路径
```

`.env` 只需要填：

```bash
PLATFORM_SERVER_REPO=/path/to/platform-server
PLATFORM_WEB_REPO=/path/to/platform-web
```

---

## 使用

1. VS Code 打开本项目
2. Copilot Chat（`Cmd+Shift+I`）→ **Agent 模式**
3. 用自然语言说你要做什么：

```
帮我看看 platform-server 最近改了什么
```
```
分析后端变更，生成 Cypress API 测试
```
```
跑一下生成的测试
```
```
列出所有已生成的测试文件
```

---

## MCP Tools

| Tool | 说明 |
|------|------|
| `analyze_diff` | 读取 git diff，分类变更文件，返回 diff 内容 |
| `get_prompt_template` | 读取测试生成模板（Copilot 用作参考） |
| `save_test_file` | 将 Copilot 生成的测试代码保存到文件 |
| `run_tests` | 执行 Cypress 测试，返回结果 |
| `list_generated` | 列出已有的测试文件 |

---

## 项目结构

```
platform-test-automation/
├── .vscode/mcp.json                 ← MCP 注册（自动启动）
├── .github/copilot-instructions.md  ← Copilot 上下文
├── mcp-server/server.js             ← MCP Server（5 个 tools）
├── scripts/                         ← Git diff 分析 & Cypress 执行
├── prompts/                         ← 测试生成模板（Copilot 参考）
├── cypress/e2e/generated/           ← AI 生成的测试
├── cypress/e2e/baseline/            ← 手动维护的测试
└── .env.example                     ← 只需填 repo 路径
```

---

## 跨项目使用

在 `platform-server` 项目里也想用？创建 `.vscode/mcp.json`：

```json
{
  "servers": {
    "platform-test": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/platform-test-automation/mcp-server/server.js"],
      "env": { "AUTOMATION_ROOT": "/absolute/path/to/platform-test-automation" }
    }
  }
}
```

---

## 自定义

编辑 `prompts/api-test-prompt.md`（后端）或 `prompts/e2e-test-prompt.md`（前端）可以调整 Copilot 生成测试的风格和覆盖范围。
