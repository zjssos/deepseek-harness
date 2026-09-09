---
description: "rxlab 工作台应用 bundle:dsh rxlab profile 的 patch 层,组装独立眼镜配镜 SPA 界面、rxlab 业务数据行与采集 agent 的登录浏览器 host 行。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-rxlab-app

[English](README.md) | 中文

## 概述

`dsh-rxlab-app` 是 `dsh rxlab`(rxlab 工作台,验光配镜工作台)profile 背后的 bundle。作为 [dsh-base](../base/README.zh.md) 之上的 patch 层,它组装 base 不携带的三件事:独立 SPA 界面(由 rxlab flags 驱动的 webserver、构建好的 rxlab-web 前端、经 `/api` 的浏览器认证)、rxlab 业务数据行(商品 Wiki catalog 与商品采集,各自持有位于 rxlab 隔离 `storages-rxlab` 根下的 storage 域),以及采集 agent 浏览工具背后的 host 层登录态浏览器。agent 平面保持 base 默认;会话经普通 Remote 界面运行。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

用 `dsh rxlab` 启动工作台;launcher 以本 bundle 的 patch(`cordis.patch.yml`)在 dsh-base 之上组装 profile。`dsh rxlab --help` 显示界面 flags;`--profile rxlab --help`(不携带 rxlab 启动服务)不启动 server。

| Flag | 默认 | 含义 |
|---|---|---|
| `--host` | `127.0.0.1` | 工作台 server 的绑定 host(拒绝 `0.0.0.0`) |
| `--port` | `3081` | 绑定端口;刻意与 web profile 的 3080 并存 |
| `--no-open` | 关 | 不在浏览器中打开 canonical URL |
| `--cdp` | 关 | 采集 agent 的浏览会话经 Chrome DevTools Protocol 接管真实浏览器,而非自有的持久 profile |

SPA 经 `/api` Remote 通道与 host 通信;rxlab 数据落在 `$DSH_HOME/storages-rxlab`、会话在 `sessions-rxlab`、设置在 `settings-rxlab.yaml`,因此本 profile 可与 web profile 在同一 home 下并存而不共享业务数据。凭据保持共享,模型继续可用。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

### 对 base 的 patch 面

patch 按 id 整行替换 base 行(每个 patch 行重述它拥有的全部键)并插入 rxlab 行:`rxlab-startup`(flags 的 commander 解析,提供 `rxlabStartup`)、`webserver` 与 `connection`(绑定值与 `/api` 信任围栏,由 `rxlabStartup`/`rxlabRuntime` 供给)、`rxlab-runtime`(本 bundle 的 glue:解析构建好的前端 dist、mount frontend-static fallback 席位、注册 rxlab 界面提示分区、打印 URL 行、开浏览器、bind 后提供 `rxlabRuntime`)、会话 Remote 界面行、rxlab 业务行 `rxlab-catalog` 与 `rxlab-collect`、`rxlab-collect-browser` host 行,以及 `agent-presets` 名单。数据隔离经由 `settings`、`session-persistence-jsonl`、`storage-json` 三行的逐行覆盖。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | `rxlab-runtime` glue 插件:dist 解析、前端挂载、界面上下文、运行时值 |
| [`src/startup.ts`](src/startup.ts) | `rxlab-startup` 提供方:flag 解析与仅调用期可得的值 |
| [`cordis.patch.yml`](cordis.patch.yml) | 对 dsh-base 的 rxlab patch |
| — | 不发布运行时 invariant companion;本包是装配体,其可观察行为由它组装的行拥有(各自行 README 有文档)。 |

</details>

-----

<a id="model-experience"></a>
## 模型体验

### 界面 persona 与 preset 名单

#### 模型可见什么

本界面的会话在 base `system-prompt` 行上获得 rxlab persona 行(眼镜配镜工作台语境);在内置 `collect` preset 上创建的会话额外携带该 preset 的工具 schema 与 `tool:browser` 分区。bundle 自身不向模型平面贡献任何自有插件。

#### Token 影响

persona 文本进入每个 rxlab 会话的系统提示;collect-preset 的增量只进入组装在该 preset 上的会话。bundle 组装本身不增加其他请求文本。

#### KV Cache 影响

稳定:persona 按界面固定、preset 名单按会话组装时挂载一次,二者与系统提示其余部分一样进入缓存;rxlab 数据变更从不使请求前缀失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **前端 dist 是装配事实** —— profile 伺服构建好的 `@deepseek-ai/dsh-rxlab-web-frontend/dist`;dist 不入库,源码 checkout 必须先构建前端,`dsh rxlab` 才有页面可伺服。
- **共享浏览器认证文案** —— 无 token 请求得到共享的 dsh browser-authentication 页,其文案仍写 "dsh web";rxlab 专属渲染是润色项。
- **一机一份登录 profile** —— 采集 agent 的持久浏览器 profile 由本机所有会话共享;`--cdp` 接管另行启动的真实浏览器(默认 `http://127.0.0.1:9222`),不可达时快速失败并给出指引。
- **业务模块覆盖** —— 验光配镜/推荐校验/效果图模块是 planned 面板;persona 声明它们未接入,而不是虚构工具。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

组装与分层架构走读(行、patch 语义、SPA 数据层)在 rxlab 文档区:[`.agents/notes/rxlab/2026-09-07-assembly-and-layered-architecture.md`](../../../.agents/notes/rxlab/2026-09-07-assembly-and-layered-architecture.md)。

</details>
