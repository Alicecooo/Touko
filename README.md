# Touko

基于 [OpenMausBot](https://github.com/milind-soni/OpenMausBot) 改造的本地 AI 工作台。Web 界面位于 `src/`，业务执行位于 `server/`，跨端协议与类型位于 `shared/`，桌面宿主位于 `electron/`。

当前开发环境使用 Node.js 24、pnpm 10.33.0 和 TypeScript 7.0.2。部分已有开发校验仍使用官方 `@typescript/typescript6` 编译器 API 兼容包。

本地环境统一放在仓库旁的 `../dev-env/`，需求和梳理文档位于 `../Touko/`。这两个目录不在当前 Git 仓库内。在 `PA/` 目录启动和检查：

```powershell
.\dev-env\start-web.ps1
.\dev-env\pnpm.ps1 run typecheck:all
```

Web 地址为 `http://127.0.0.1:5199/`。真实模型执行需要另行配置独立 Agent CLI 或模型服务；本地启动器为 Codex CLI 使用独立的配置目录。

源码旁保留模块单测，业务测试按模块集中在 `tests/server/`，辅助实现位于 `tests/support/`，固定断言样本位于 `tests/fixtures/`。开发辅助脚本说明见 [scripts/scripts.md](scripts/scripts.md)，验证入口见 [docs/verification/README.md](docs/verification/README.md)。

Git 记录源码、项目配置、锁文件、必要 UI 素材、固定样本和第三方许可证。依赖、构建与安装包产物、运行数据、凭据、缓存、临时报告及未引用的上游演示录屏和截图由 `.gitignore` 排除；`build/` 中的应用图标和安装脚本继续保留。
