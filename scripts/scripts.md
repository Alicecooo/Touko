# 开发脚本

`scripts/` 负责产出和准备环境，结果检查统一在 `tests/`。

| 位置 | 用途 |
| --- | --- |
| `build/` | 服务端打包、更新器组装、桌面依赖发布文件处理 |
| `setup/` | 准备 Windows/Linux 桌面控制、浏览器、HTTPS 隧道和数据库依赖 |
| `generators/` | 生成头像数据、模型目录、翻译、依赖清单和固定测试样本 |
| `generators/avatar-shapes/` | 头像外形、栅格、距离场和五官位置的生成算法 |
| `dev/` | 隔离环境、开发 MCP 服务、浏览器驱动和预览服务 |
| `previews/` | 被现有开发环境或测试使用的组件预览页面 |
| `benchmarks/` | 输出性能测量结果，不作通过或失败断言 |
| `clean-build-output.mjs` | 清理构建产物 |
| `migrate-skill-library.ts` | 迁移技能库 |

目录按真实职责设置，少量独立工具直接放在根部，不再为它们单独分组。

## 常用命令

在项目根目录运行：

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` / `pnpm dev:server` | 启动 Web 页面 / 开发服务端 |
| `pnpm dev:desktop` | 启动桌面程序 |
| `pnpm run dev:isolated --help` | 查看隔离开发环境的操作命令 |
| `pnpm generate:avatar-shapes` | 生成 `shared/mascot-bodies.ts` |
| `pnpm generate:browser-vendor-fixture` | 生成浏览器依赖校验使用的固定样本；修改后需复核 JSON |
| `pnpm generate:translations <语言代码>` | 生成翻译草稿；需要本机 Claude CLI 登录 |
| `pnpm prepare:browser` / `pnpm prepare:duckdb` | 准备浏览器 / 数据引擎 |
| `pnpm prepare:https-tunnel` | 准备 HTTPS 隧道工具 |
| `pnpm prepare:windows-desktop-control` | 准备 Windows 桌面控制依赖 |
| `pnpm prepare:linux-desktop-control` | 准备 Linux 桌面控制依赖 |
| `pnpm build:server` / `pnpm build:updater` | 构建服务端 / 更新器 |
| `pnpm package:win` / `pnpm package:linux` | 生成桌面安装包 |
| `pnpm bench:observation` / `pnpm bench:persistence` | 输出观察处理 / 持久化性能数据 |
| `pnpm bench:browser-stream --chrome <路径>` | 测量浏览器画面传输性能 |
| `pnpm typecheck:scripts` | 检查开发脚本类型 |

测试和结果比对入口见 [验证说明](../docs/verification/README.md)。

