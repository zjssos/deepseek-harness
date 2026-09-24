---
description: "rxlab 工作台整库备份：把工作空间存储根下所有 rxlab_* 业务存储域打包为一个 JSON bundle 并可还原，以及类型化 rxlabBackup Remote 与自带 Client 贡献的装配。"
kind: "package-reference"
---
# rxlab Backup

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-rxlab-backup` 拥有 rxlab 工作台的整库备份。Host 侧它提供 `ctx.backupController` 服务和生成的 `ctx.remote.rxlabBackup` namespace。`export` 遍历工作空间存储根（`rxlabPaths.storageRoot`）下所有 `rxlab_*` 存储域，把每个 per-record 文档打包为一个 JSON bundle；`import` 校验 bundle 后把每条记录经临时文件加原子 rename 写回 `<storageRoot>/<domain>/<table>/<key>.json`。本包从既有 `rxlabPaths` 服务读取存储根，因此不新增跨包依赖。Client 侧本包是 `dsh.client` 行，其 `/client` bundle 自行 mount 该 namespace，因此 rxlab SPA 恰好在组合 rxlab 业务数据处启动 backup。本包刻意不加入平台 `api-remotes` 装配：工作空间业务树是 rxlab 业务数据，不是通用 Host 能力。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

rxlab profile 组合一行 `rxlab-backup`（`@deepseek-ai/dsh-rxlab-backup`）。Host Loader 激活 `BackupController` 服务：它从注入的 `rxlabPaths` 服务解析工作空间存储根，并向 Typert Gateway 注册 `rxlabBackup` namespace。SPA 的 headless client boot 会激活本包自身的 `/client` bundle，其 `apply` mount 生成的 Remote contribution，于是浏览器内 `remote.rxlabBackup.export/import` 即可调用。

`export` 接受空请求，列出 `<storageRoot>` 下的 `rxlab_*` 域目录，读取每张表的 `<key>.json` 文档，并按 domain、table、key 排序返回。`session_projcache` 及所有非 `rxlab_` 单元被排除；格式损坏或没有非负整数版本戳的文档被跳过。`import` 要求 `formatVersion: 1`、记录数不超过 200000 的数组，且每条记录需有 `rxlab_*` 域与路径安全的 table 和 key；越界记录被跳过并计数，非法 bundle 抛 `backup/bad-request`。每条被接受的记录都原子写入（先临时文件，再 rename）。

Wire 类型在 `./types`（浏览器安全 JSON、无运行时代码）；文件系统与校验全部由 controller 负责。

**运行时不变式：** 不发布运行时不变式伴生包（companion）：工作空间存储树是权威介质，没有可独立观测而发散的关系。

-----

<a id="model-experience"></a>
## 模型体验

### 工作空间备份

#### 模型可见什么

无。本包不注册工具、不注入提示词、不追加会话事件；bundle 在 `ctx.remote.rxlabBackup` 与存储树之后组装，模型只能经消费方自身有文档说明的界面触达（今天是 rxlab SPA）。

#### Token 影响

零：本包没有文本进入任何模型请求。

#### KV Cache 影响

独立：backup 读写不触碰请求前缀，这里没有任何东西会使提供方缓存失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 导入仅在应用重启（或相关域重新打开）后生效；运行中的 controller 保留其内存表，不会感知其下写入的文件。
- bundle 原样携带存储记录，不做跨版本迁移；导入为更新或更旧域版本戳的 bundle 依赖该域自身的兼容版本策略。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
