# Touko

基于 [OpenMausBot](https://github.com/milind-soni/OpenMausBot) 改造的本地 AI 工作台。Web 界面位于 `src/`，业务执行位于 `server/`，跨端协议与类型位于 `shared/`，桌面宿主位于 `electron/`。

当前开发环境使用 Node.js 24、pnpm 10.33.0 和 TypeScript 7.0.2。部分已有开发校验仍使用官方 `@typescript/typescript6` 编译器 API 兼容包。

仓库地址：[Alicecooo/Touko](https://github.com/Alicecooo/Touko)。克隆后的源码目录为 `Touko/`。

## 从源码运行

准备 Node.js 24 或更高版本和 pnpm 10.33.0，然后执行：

```powershell
git clone https://github.com/Alicecooo/Touko.git
cd Touko
pnpm install --frozen-lockfile
pnpm dev:server
```

在另一个终端进入同一目录运行 `pnpm dev`。前端地址为 `http://127.0.0.1:5199/`，API 默认为 `http://127.0.0.1:8799`。

`pnpm run typecheck` 检查前后端生产代码；`pnpm run build` 构建前端，`pnpm run build:server` 构建服务端。当前仍有此前功能删减留下的测试问题，不能将全量测试视为已全部通过。

## 当前本机环境

本机环境统一放在仓库旁的 `../dev-env/`，需求和梳理文档位于 `../Touko-docs/`。这两个目录不在当前 Git 仓库内。在 `PA/` 目录启动和检查：

```powershell
.\dev-env\start-web.ps1
.\dev-env\pnpm.ps1 run typecheck:all
```

Web 地址为 `http://127.0.0.1:5199/`。Web 开发数据固定使用 `../dev-env/.runtime/openmausbot/`；直接执行 `pnpm dev:server` 也会沿用这个目录，避免在用户目录下生成第二套 Bot 和消息库。真实模型执行需要另行配置独立 Agent CLI 或模型服务；本地启动器为 Codex CLI 使用独立的配置目录。

源码旁保留模块单测，业务测试按模块集中在 `tests/server/`，辅助实现位于 `tests/support/`，固定断言样本位于 `tests/fixtures/`。开发辅助脚本说明见 [scripts/scripts.md](scripts/scripts.md)。

Git 记录源码、项目配置、锁文件、必要 UI 素材、固定样本和第三方许可证。依赖、构建与安装包产物、运行数据、凭据、缓存、临时报告及未引用的上游演示录屏和截图由 `.gitignore` 排除；`build/` 中的应用图标和安装脚本继续保留。
