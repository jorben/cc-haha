# 贡献指南

感谢你帮助改进 Claude Code Haha。

完整贡献指南包含本地检查、真实模型 baseline、质量门禁报告和 PR 要求：

- 中文：[docs/guide/contributing.md](docs/guide/contributing.md)
- English：[docs/en/guide/contributing.md](docs/en/guide/contributing.md)

大多数贡献者在提交 PR 前应先运行：

```bash
bun install
bun run quality:pr
```

这个门禁现在会同时生成质量报告和覆盖率报告：

```text
artifacts/quality-runs/<timestamp>/report.md
artifacts/quality-runs/<timestamp>/report.json
artifacts/quality-runs/<timestamp>/junit.xml
artifacts/quality-runs/<timestamp>/logs/*.log
artifacts/coverage/<timestamp>/coverage-report.md
```

覆盖率 baseline/threshold 变更需要维护者加 `allow-coverage-baseline-change`。CI 会优先用 base branch 的 baseline 做 ratchet 对比，避免 PR 自己降低 baseline 后绕过门禁。
被 quarantine 的测试必须保留 owner、reviewAfter 和 exitCriteria；过期后 `check:quarantine`、`check:server`、`check:coverage` 都会阻断。

如果你在全新 clone 中运行 adapter 或 native 相关检查，还需要安装 adapter 依赖：

```bash
cd adapters
bun install
```

如果改动涉及桌面端聊天路径、provider/runtime 选择、CLI bridge、权限、工具、文件编辑或发布打包，还需要用你本地可用的模型提供商跑真实 baseline：

```bash
bun run quality:providers
bun run quality:gate --mode baseline --allow-live --provider-model <selector>:main
```

只想跑真实 provider/desktop smoke 时，可以使用：

```bash
bun run quality:smoke --provider-model <selector>:main
```

发版前使用 `quality:gate --mode release --allow-live`，live lane 不允许静默跳过；如果缺 provider、额度或外部账号，要在报告里明确写 blocker。
