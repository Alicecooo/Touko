# Touko

Touko 是基于 [OpenMausBot](https://github.com/milind-soni/OpenMausBot) 改造的本地 AI 工作台，用来在本机运行一组 AI 助手。

仓库：[Alicecooo/Touko](https://github.com/Alicecooo/Touko)

运行环境统一使用相邻的 `dev-env/`（DEVENV）；`Touko/` 只保存项目源码和项目依赖。在 `D:\Code\PA` 中运行：

```powershell
.\dev-env\setup.ps1
.\dev-env\start-web.ps1
```

Web `http://127.0.0.1:5209/`，API `http://127.0.0.1:8809/`。环境、构建和停止方式见 [DEVENV 说明](../dev-env/README.md)。

```powershell
.\dev-env\pnpm.ps1 run build
.\dev-env\pnpm.ps1 run typecheck:all
.\dev-env\pnpm.ps1 run lint
```

pnpm 工具、配置和缓存均位于 DEVENV 内部。不要在 `D:\` 根目录或其他环境外的位置安装、配置或直接调用全局 pnpm。

测试只保留 `tests/e2e/**/*.e2e.test.*` 形式的端到端测试，开发完成后再编写。本轮不恢复已删除的测试；当前 `test:e2e` 在没有测试文件时正常退出。
