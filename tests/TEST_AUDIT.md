# 非 E2E 测试清理记录

日期：2026-11-09。

## 本批范围

扫描 `src`、`server`、`shared`、`electron` 和 `tests`，共找到 1,124 个测试文件。逐项审查本批候选后，删除 14 个文件，裁剪 12 个混合测试文件，移除 77 个测试定义，测试代码净减少约 1,250 行。另清理了 3 个测试文件中的无用导入和变量。没有删除或修改 E2E 文件。

计数中的“测试定义”指一个 `it` / `test` 声明；`it.each` 展开后的运行用例数可能更多。本批不更改业务实现，保留工作区此前的 API 配置改动。

## 删除依据与清单

| 文件 | 原来的检查 | 处理理由 |
| --- | --- | --- |
| `src/lib/control-focus.test.ts` | 用正则匹配焦点 CSS 规则 | 绑定 CSS 写法，没有操作焦点或测量可见性 |
| `src/lib/field-focus.test.ts` | 扫描输入框相关 CSS 和类名 | 绑定实现结构，没有验证实际焦点状态 |
| `src/lib/crisp-rendering.test.ts` | 匹配字体平滑配置和 Electron 参数 | 没有验证实际渲染效果 |
| `src/lib/control-scale.test.ts` | 固定按钮尺寸、字号和组件类名 | 样式调整会导致失败，不能说明交互有无回归 |
| `src/lib/faded-text.test.ts` | CSS 片段与对比度计算 | 删除样式写法断言；实际对比度由已有 `check:contrast` 检查保留 |
| `src/components/provider-marks.test.ts` | 扫描图标源码中的浅色十六进制值 | 没有结合实际背景和渲染效果判断可见性 |
| `src/components/chat-dir-auto.test.ts` | 在源码附近固定字符范围内寻找 `dir="auto"` | 移动 JSX 或提取组件就会误报，未验证排版方向 |
| `src/components/Select.guard.test.ts` | 固定必须使用的组件名称及允许的类名 | 约束组件写法，没有打开或选择下拉项 |
| `src/locales/words.test.ts` | 禁止旧措辞、英式拼写和破折号 | 文案规则不属于业务行为测试 |
| `src/locales/vocabulary.test.ts` | 扫描旧品牌和固定词语 | 与当前项目的功能正确性无关 |
| `src/locales/data-keys.test.ts` | 在源码中搜索特定前缀翻译键 | 简单字符串搜索无法可靠判断动态翻译键是否使用 |
| `electron/local-only-hoist.node-test.mjs` | 用行号判断声明是否位于调用之前 | 不分析作用域和执行时机，无法证明桌面端可启动 |
| `src/lib/color-utilities.test.ts` | 扫描未定义的颜色工具类 | 有用的规则迁入 lint；删除测试扫描器自身的数量断言 |
| `src/lib/copy-text.guard.test.ts` | 扫描绕过剪贴板助手的调用 | 有用的规则迁入 lint；保留真实剪贴板行为测试 |

## 混合文件中保留什么

| 文件 | 移除 | 保留 |
| --- | --- | --- |
| `src/lib/fonts.test.ts` | 字体 CSS 块字符串检查 | 选择、保存、恢复及无效值回退 |
| `src/lib/chat-width.test.ts` | 固定宽度数字、CSS 选择器、组件类名 | 偏好持久化、恢复、存储不可用时的回退 |
| `src/lib/skins.test.ts` | 固定旧主题顺序、CSS 块和颜色方案写法 | 主题描述与注册数据的一致性 |
| `src/lib/glass-surface.test.ts` | 弹窗 CSS、固定模糊值、组件源码检查 | 不同窗口模式下的顶部间距计算 |
| `src/lib/bot-identity.test.ts` | 固定行高、类名和选择器检查 | 各主题、各机器人颜色组合的实际对比度计算 |
| `src/components/RawMarkdownToggle.test.ts` | 扫描 ChatView 中的组件 key | 切换状态、翻译、原始文本安全转义 |
| `src/components/ChatErrorBanner.test.ts` | 固定换行类名及引用位置 | 错误显示、详情折叠、无错误时隐藏 |
| `src/components/TurnPresence.test.ts` | 闪光效果的 padding / margin 字符串 | 计时、状态切换和单条状态保持 |
| `src/components/ChatMarkdown.test.ts` | 用 CSS 字符串判断公式是否能横向滚动 | Markdown / 数学公式解析、安全与交互用例 |
| `src/components/widget/WidgetMessage.test.ts` | 扫描所有组件源码是否含颜色字面量 | 控件输入、键盘操作和提交内容 |
| `src/components/touch-actions.test.ts` | 源码类名扫描及扫描器自检 | 使用真实 Tailwind 编译器验证触屏媒体规则 |
| `server/agent/system-prompt.test.ts` | 固定提示词措辞、重复的空值检查 | Soul 顺序、空片段过滤、稳定/动态上下文拆分、数据编码、工具授权分支 |

没有做逐用例分支覆盖比对，因此没有以“E2E 应该覆盖了”为由删除业务单元测试。配置校验、解析器、持久化、调度算法、协议和权限边界测试继续保留；按平台或显式环境开关运行的测试也未当作“永远跳过”删除。

## 静态规则

`tests/checks/source-conventions.check.mjs` 检查未定义的颜色 token 以及绕过 `copyText` 的直接调用，已接到 `pnpm lint`。验证过正常源码能通过，临时故障样本中的未定义 token 和跨行剪贴板调用都会被拒绝，样本已移除。

现有 `pnpm check:contrast` 和 `pnpm i18n:check` 保留。删除固定样式、固定文案断言不代表实际视觉及可访问性已经获得完整 E2E 覆盖。

## 验证结果

- 清理前的候选基线：22 个文件、255 个用例通过。
- 清理后涉及文件及邻近行为回归：14 个文件、407 个用例通过。
- 生成模型目录和 HTTPS 隧道脚本：2 个文件、18 个用例通过。
- Electron 组织入口：13 个用例通过。
- 全部前端及提示词测试：390 个文件，共 4,165 个用例，4,161 个通过、4 个失败。失败集中在 `src/lib/memory.test.ts`、`src/lib/schedule-label.test.ts`、`src/components/widget/WidgetFields.test.ts`，是默认 Intl 日期、12/24 小时制、星期名称与英文断言不一致；这些文件未被本批修改或删除。
- 模型 API 连接、MCP 选择、上下文压缩的 E2E：11 个用例，10 个通过、1 个失败。`tests/server/mcp/mcp-selection.e2e.test.ts:162` 预期客户端修改授权返回 403，实际返回 200；失败用例及其权限逻辑均未被本批修改，应单独调查。
- 应用和服务端类型检查通过；修改文件的 lint、静态规则、翻译、颜色对比度和 `git diff --check` 通过。
- 全仓库 lint 仍有 52 条非本批修改文件的告警，包括两个空 E2E 文件和未使用变量。没有通过删除 E2E 或放宽检查来消除告警。
- 测试类型检查仍在 `server/workspace/workspace-backup-policy.test.ts:23` 报 `features` 字段不存在；该文件未改动。

本次没有提交 Git。
