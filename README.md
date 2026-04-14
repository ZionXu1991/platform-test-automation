# Platform Test Automation

通过 VS Code Copilot 自动化 Cypress 测试生成与执行。

当 `platform-server` 或 `platform-web` 有代码变更时，AI 自动分析变更并生成对应的 Cypress 测试。

---

## 工作原理

```
你在 Copilot Chat 说      Copilot 自动执行            结果
─────────────────────    ──────────────────────      ────────────────
"后端最近改了什么"    →   analyze_diff(server)     → 变更文件分类报告
"生成 Cypress 测试"   →   generate_tests(server)   → cypress/e2e/generated/
"跑一下测试"         →   run_tests(generated)      → pass/fail 报告
```

Copilot 通过 MCP (Model Context Protocol) 调用本项目的脚本，**你只需用自然语言对话**。

---

## 前提条件

- VS Code 1.95+
- GitHub Copilot + Copilot Chat 扩展（已安装并登录）
- 三个 repo 在同一父目录下：

```
~/repos/                        ← 或者你的任意目录
├── platform-server/            ← 后端 repo
├── platform-web/               ← 前端 repo
└── platform-test-automation/   ← 本项目
```

---

## 团队使用指南

### 第一步：打开 Devcontainer

```bash
git clone <this-repo> platform-test-automation
code platform-test-automation
```

在 VS Code 中：`Cmd+Shift+P` → **Reopen in Container**

> 首次构建约 2-3 分钟，之后秒开。容器会自动安装所有依赖。

### 第二步：配置 API Key

容器启动后，编辑 `.env`：

```bash
# 必填：AI 生成测试需要
OPENAI_API_KEY=sk-your-key-here

# 已由 devcontainer 自动配置，无需修改：
# PLATFORM_SERVER_REPO=/workspaces/platform-server
# PLATFORM_WEB_REPO=/workspaces/platform-web
```

### 第三步：使用

打开 Copilot Chat（`Cmd+Shift+I`），切换到 **Agent 模式**，然后用自然语言说：

**分析变更：**
```
帮我看看 platform-server 最近一次提交改了什么
```

**生成测试：**
```
分析后端最近的变更，生成 Cypress API 测试
```

**执行测试：**
```
跑一下生成的 Cypress 测试
```

**一键全流程：**
```
帮我跑一下完整流水线：分析 platform-web 最近3次提交 → 生成测试 → 执行
```

---

## MCP Tools 说明

Copilot 可用的 5 个工具：

| Tool | 参数 | 说明 |
|------|------|------|
| `analyze_diff` | repo, range | 读取 git diff，分类变更文件 |
| `generate_tests` | repo, range | 分析 diff + AI 生成 Cypress 测试 |
| `run_tests` | spec, browser, headed | 执行 Cypress 测试 |
| `full_pipeline` | repo, range | 分析 → 生成 → 执行 一条龙 |
| `list_generated` | — | 列出已生成的测试文件 |

参数说明：
- `repo`: `"server"`, `"web"`, 或 `"all"`
- `range`: git diff 范围，如 `"HEAD~1"`, `"main..develop"`, `"abc123..def456"`
- `spec`: `"generated"`, `"baseline"`, 或 `"all"`

---

## 项目结构

```
platform-test-automation/
├── .devcontainer/           ← Devcontainer 配置（团队零配置）
│   ├── devcontainer.json
│   ├── Dockerfile
│   └── post-create.sh
│
├── .vscode/mcp.json         ← MCP 注册（VS Code 自动启动）
│
├── mcp-server/              ← MCP Server（Copilot ↔ 脚本 桥梁）
│   ├── package.json
│   └── server.js
│
├── scripts/                 ← 核心引擎
│   ├── config.js            ← 配置读取
│   ├── analyze-diff.js      ← Git diff 分析 & 分类
│   ├── generate-tests.js    ← AI 调用 & 测试生成
│   └── run-automation.js    ← 主编排器（CLI）
│
├── prompts/                 ← AI 测试生成 Prompt 模板
│   ├── api-test-prompt.md   ← 后端：cy.request() API 测试
│   └── e2e-test-prompt.md   ← 前端：cy.visit() E2E 测试
│
├── cypress/
│   ├── e2e/
│   │   ├── baseline/        ← 手动维护的基线测试（不被覆盖）
│   │   └── generated/       ← AI 生成的测试（每次覆盖）
│   ├── support/             ← 自定义命令（cy.login 等）
│   └── fixtures/            ← 测试数据
│
├── .github/
│   ├── copilot-instructions.md  ← Copilot 上下文
│   └── workflows/auto-test.yml ← GitHub Actions CI/CD
│
├── cypress.config.js
├── package.json
├── .env.example
└── .gitignore
```

---

## 自定义

### 改善 AI 生成质量

编辑 `prompts/api-test-prompt.md`（后端）或 `prompts/e2e-test-prompt.md`（前端），添加项目特有的上下文，例如 API 前缀、认证方式、CSS 选择器策略等。

### 保留好的测试

将 `cypress/e2e/generated/` 中质量好的测试移到 `cypress/e2e/baseline/`，AI 不会覆盖 baseline 目录。

### 调整登录接口

编辑 `cypress/support/commands.js` 第 27 行，改成你的实际登录 API 地址。

---

## CI/CD 集成

`.github/workflows/auto-test.yml` 支持通过 `repository_dispatch` 从 `platform-server` 或 `platform-web` 的 CI 触发：

```yaml
# 在 platform-server 的 CI 中加入：
- name: Trigger E2E Tests
  run: |
    curl -X POST \
      -H "Authorization: token ${{ secrets.GH_PAT }}" \
      -H "Accept: application/vnd.github.v3+json" \
      https://api.github.com/repos/your-org/platform-test-automation/dispatches \
      -d '{"event_type":"test-trigger","client_payload":{"repo":"server","ref":"${{ github.sha }}"}}'
```

---

## 常见问题

**Q: Copilot 没有调用 MCP tools？**
确保 Copilot Chat 切换到了 **Agent 模式**（输入框左侧下拉选择）。

**Q: 容器里找不到 platform-server 目录？**
确保三个 repo 在同一父目录下，devcontainer 通过 bind mount 将它们挂载到 `/workspaces/` 下。

**Q: 生成的测试质量不高？**
编辑 `prompts/` 目录下的 prompt 模板，添加项目特有的 API 路径、数据格式、选择器策略等上下文。
