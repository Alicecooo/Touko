# 开发脚本

`scripts/` 负责产出和准备环境。测试只保留端到端测试，统一放在 `tests/e2e/`；开发完成后再编写。

| 位置 | 用途 |
| --- | --- |
| `build/` | 服务端打包、更新器组装、桌面依赖发布文件处理 |
| `setup/` | 准备 Windows/Linux 桌面控制、HTTPS 隧道和桌面服务运行依赖 |
| `generators/` | 生成人物头像总览、模型目录、翻译和桌面依赖清单 |
| `dev/` | 开发 MCP 服务、外部浏览器 QA 工具和预览服务 |
| `previews/` | 被现有开发环境或测试使用的组件预览页面 |
| `benchmarks/` | 输出性能测量结果，不作通过或失败断言 |
| `clean-build-output.mjs` | 清理构建产物 |
| `migrate-skill-library.ts` | 迁移技能库 |

目录按真实职责设置，少量独立工具直接放在根部，不再为它们单独分组。

## 常用命令

在 `PA/` 中通过 `.\dev-env\pnpm.ps1` 运行下表命令。例如 `build` 使用 `.\dev-env\pnpm.ps1 run build`；不要在环境外直接调用全局 pnpm。

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` / `pnpm dev:server` | 启动 Web 页面 / 开发服务端 |
| `pnpm dev:desktop` | 启动桌面程序 |
| `pnpm generate:portrait-preview` | 生成人物头像与表情总览 |
| `pnpm generate:translations <语言代码>` | 生成翻译草稿；需要本机 Claude CLI 登录 |
| `pnpm prepare:server-runtime` | 准备桌面服务运行依赖 |
| `pnpm prepare:https-tunnel` | 准备 HTTPS 隧道工具 |
| `pnpm prepare:windows-desktop-control` | 准备 Windows 桌面控制依赖 |
| `pnpm prepare:linux-desktop-control` | 准备 Linux 桌面控制依赖 |
| `pnpm build:server` / `pnpm build:updater` | 构建服务端 / 更新器 |
| `pnpm package:win` / `pnpm package:linux` | 生成桌面安装包 |
| `pnpm bench:observation` / `pnpm bench:persistence` | 输出观察处理 / 持久化性能数据 |
| `pnpm typecheck:scripts` | 检查开发脚本类型 |

使用 `.\dev-env\pnpm.ps1 test:e2e` 运行端到端测试，`.\dev-env\pnpm.ps1 run typecheck:all` 检查生产代码和开发脚本。当前测试文件已删除，空测试正常退出；本轮开发过程中不新增或恢复测试。UI 验证工具使用操作者配置的外部浏览器 CLI，不再下载或向 Bot 提供内置浏览器。

