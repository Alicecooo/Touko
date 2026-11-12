# Bot 交流架构进度（交接）

这份文档记录架构对齐做到哪一步，方便后续由人工接着做。仓库是 [Alicecooo/Touko](https://github.com/Alicecooo/Touko)。

未完成的代码改动**没有提交、没有推送、也没有开成功能 PR**。云端实现任务在中途被停掉（额度不够），不要把附录里的补丁当成已经验收的结果。

当前 `main` 在这份文档撰写时已经包含：

- [PR #4](https://github.com/Alicecooo/Touko/pull/4) `fix: remove unused eval suite and fix room conversation turns`
- [PR #5](https://github.com/Alicecooo/Touko/pull/5) `chore: remove leftover tests, scripts, and dead remnants`（残留清理，不改会话逻辑）

附录补丁是对着 PR #4 之后的 `main`（`a24050d`）写的。PR #5 没有改下面这些会话相关文件，但接着做之前仍应先在最新 `main` 上确认能否干净打上。

## 目标

按 Grok Bot 的交流模型对齐：

- 用户和某个 bot 的 1:1 私聊、命名群、bot 与 bot 的频道，是三类分开的会话
- `@Name` 和 `@everyone` 用来选择谁被请入这一轮
- 群成员可以保持静默 / `(pass)`；静默是有效轮次，不是失败。1:1 仍需要回复
- bot 只以自己的身份说话，不能写成另一个参与者或用户
- 每个房间有稳定的会话（“家”线程），不能把客户端当前打开的任务（`group.threadId`）当成房间本身

## 已经落在 main 里的（PR #4）

已经做到：

- 删除整个 `evals/` 以及相关脚本
- 群成员可以明确 `(pass)` 或空轮次保持静默，不会被反复追问；1:1 仍要回复
- 提示词要求 bot 只以自己的身份说话；写成别人或用户的行在保存和 @ 跟进前会被丢掉
- 房间发帖、跨房间协调、日历投递，改走房间的“家”线程，而不是当时打开的那个任务

这里的“家”线程在 PR #4 里仍是**算出来的**：非 DM 房间取任务列表里最早的那条，DM 则用 `group.threadId`。实现主要在 `server/teams/room-home.ts`、`server/teams/room-reply.ts` 和 `server/index.ts`。

前端没有做大改。

## 审查后还没做完的缺口

PR #4 没有把交流架构完整对齐。停掉之前的审查结论是：

1. **房间会话还是“猜”的，不是存下来的。** `roomHomeThreadId()` 每次按任务创建时间推算。如果后来又开了更早时间戳的任务，或家线程被删掉再重绑，房间身份可能跟着漂。
2. **仍有路径把 `group.threadId`（客户端当前打开的任务）当成房间会话。** 例如 `lastHumanRoomMessageAt` 只扫当前打开的任务，用来判断房间里“人是不是刚说过话”；bot 正在说话时，也曾用 `busyBotId` 回退到这个打开的任务。
3. **三类会话的划分还不完整。** 提示词里，bot 对 bot 的频道仍被写成“和用户的 1:1 私聊”；也没有明确写清：私聊、命名群、bot 对 bot 频道不要互相归档或粘贴。
4. **近期工作列表**会先加一条没有标题的 `group.threadId`，可能把房间里正在打开的任务显示成“无标题房间”，盖住真正的任务标题。

`@Name` / `@everyone` 在命名群里的轮次选择，PR #4 已经按“被点到才回、否则可以 pass”写过。1:1 里的 @ 是走 `coordinate_bots` 去另开工作线程，审查时没有把它改完，也没有做完整的端到端核对（客户端路由、`list_room_targets`、跨房间协调是否会把私聊和群消息混在一起）。

## 已经动手、但没有落地的改动

停掉之前，实现已经在 9 个文件里改了一部分（约 +125 / −23），然后在安装依赖、准备跑测试时被中止。当时环境是 Node 22，仓库要求 `node >= 24`，测试没有跑完。

改动意图是：

- 在 `GroupRecord` 上增加存盘字段 `homeThreadId`（不暴露到前端的 `WireGroup`）
- 创建房间时写入；加载时给旧数据补上；切换任务时保持不变；家线程被删除后再绑到剩余任务里最早的一条
- `lastHumanRoomMessageAt` 改为扫描该房间所有线程（已有辅助函数 `roomThreadIds`）
- 去掉用 `busyBotId` 把“正在说话”错误算到当前打开任务上的回退
- 改系统提示：把用户 1:1、命名群、bot 对 bot 频道写成三类分开的会话，不要把一种会话写进另一种
- 修正近期工作列表里打开中房间任务的标题
- 团队备份导入后重新计算 `homeThreadId`
- 补了 `room-home`、`group-tasks`、`recent-work` 的测试

这些改动只存在于当时的云端机器上，**仓库里没有对应分支**。附录 [`bot-architecture-unfinished.patch`](./bot-architecture-unfinished.patch) 是从那次未完成编辑里还原的补丁，**未经过完整检查，可能不完整或不能直接干净应用**。请自行审阅、变基到最新 `main`、跑测试后再继续，不要直接当成品合并。

涉及文件：

- `server/teams/room-home.ts`
- `server/teams/room-home.test.ts`
- `server/storage/store.ts`
- `server/storage/group-tasks.test.ts`
- `server/index.ts`
- `server/agent/system-prompt.ts`
- `server/packages/team-backup.ts`
- `server/observability/recent-work.ts`
- `server/observability/recent-work.test.ts`

## 建议接着做的

1. 在最新 `main` 上尝试应用或重写 `homeThreadId`：让房间会话成为存下来的稳定 id，而不是每次推算。
2. 继续清掉仍把“当前打开的任务”当成“房间会话”的路径，并补测试。
3. 端到端核对三类会话是否隔离：用户 1:1 私聊、命名群、bot 对 bot 频道；包括客户端路由、`coordinate_bots`、`list_room_targets`，避免私聊和群消息归档到一起。
4. 核对 `@` 在 1:1 和群里的行为是否符合上面的模型。
5. 用 Node >= 24 跑相关测试，再用 Conventional Commits 开实现 PR。前端按原要求，不做大改。

这份文档只做交接，不包含实现合入。
