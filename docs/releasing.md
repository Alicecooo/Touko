# 构建与安装包

Web 开发使用 `pnpm dev` 和 `pnpm dev:server`。桌面安装包支持 Windows 和 Linux：

```sh
pnpm package:win
pnpm package:linux
```

构建入口只负责准备依赖和产出安装包。校验入口读取已经准备好的产物，见 [验证说明](verification/README.md)。

```sh
pnpm build:server
pnpm test:packaged-server
pnpm check:windows-desktop-control
pnpm check:linux-package
```

后两项需要对应平台与资源；执行参数见 `tests/checks/` 中相应的 `*.check.*` 文件。构建结果进入 `release/`、`dist-server/` 等目录，不作为固定断言样本。
