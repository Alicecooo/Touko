# 测试与校验

`tests/` 负责断言、哈希比对和端到端验证，`scripts/` 负责生成、环境准备和打包。测试读取固定基准，不调用生成器刷新预期结果。

## 常用入口

在项目根目录运行：

| 命令 | 用途 |
| --- | --- |
| `pnpm test` | Vitest 测试及 Electron Node 测试 |
| `pnpm test:e2e` | `tests/e2e/` 中的 Web 完整交互场景 |
| `pnpm test:server:unit` | Server 源码旁的模块单测 |
| `pnpm test:server` | 按业务模块组织的 Server HTTP/MCP/CLI、协议和 E2E 场景；部分需要特定平台或浏览器 |
| `pnpm typecheck:tests` | 测试代码类型检查 |
| `pnpm typecheck:scripts` | 开发脚本类型检查 |
| `pnpm i18n:check` | 翻译键、占位符与源文本版本 |
| `pnpm check:model-catalog` | 已提交模型目录的一致性 |
| `pnpm check:electron-syntax` | Electron 模块语法 |
| `pnpm test:packaged-server` | 检查已有服务端构建产物 |
| `pnpm test:evals` | 独立评估测试；真实模型调用保持显式开启 |

针对单个文件可用 `pnpm exec vitest run <文件路径>`。使用已有依赖时，也可直接执行 `node node_modules/vitest/vitest.mjs run <文件路径>`。

针对 Server 单个业务模块可用 `pnpm exec vitest run tests/server/browser/`，将 `browser` 替换为所需模块。原来按测试层级划分的两个 Server 命令已由 `test:server` 统一替代；不再维护独立的 integration/E2E 目录。

## 目录

- `tests/scripts/`：环境准备和生成工具的行为测试。
- `tests/checks/`：自动测试与需要显式执行的 `*.check.*` 校验入口。
- `tests/e2e/`：完整交互和服务流程。
- `tests/fixtures/`：固定断言输入、预期结果与哈希清单。
- `tests/server/<业务模块>/`：同一业务的 HTTP、MCP、CLI、协议和端到端测试放在一起，与 `server/` 的业务目录对应；用 `.e2e.test.ts` 后缀标记完整服务场景。
- `tests/support/`：按职责归类的测试辅助实现；`environment/` 管环境与进程，`http/` 管 HTTP 连接工具，其他目录按浏览器、驱动、鉴权、MCP 等业务划分。
- 源码旁的单元测试：验证所属模块的规则与公共操作。

固定样本需要更新时，先在 `scripts/generators/` 生成，再人工审阅产物。测试不得写回固定样本、修改应用源码后恢复，或自动接受新哈希。临时目录可用于运行服务和构造场景输入，不用于生成预期基准。

## 平台和构建产物

Windows/Linux 桌面控制、安装包及容器校验使用对应的 `check:*` 命令，参数见 `tests/checks/` 的入口文件。需要先单独构建或准备依赖；校验过程不代替构建。

平台、浏览器、外部凭据或构建产物不满足时，应报告未执行或跳过的范围，不将其计为通过。运行日志和临时服务数据放入临时目录，不放入固定样本目录。

开发工具说明见 [脚本说明](../../scripts/scripts.md)。Server 执行流程和目录说明见 [Touko Server 梳理](../../../Touko/Server梳理/README.md)。

辅助文件的职责、命名及加载方式见 [测试辅助目录](../../../Touko/Server梳理/测试辅助目录.md)。
