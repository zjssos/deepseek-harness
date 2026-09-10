# Agent Note: rxlab content 域与官方 Remote 包

Status: implemented

[English](2026-09-10-rxlab-content-domain.md) | 中文

## 问题

rxlab 工作台（`dsh rxlab`）需要可持久的知识词条与可复用话术，每条可打上六个工作台阶段之一的标签，供 SPA 内容管理面板浏览与维护并跨重启保留。这些文本语料不是商品主数据：`rxlab_catalog` 域存放镜架 / 镜片 / 商品行，携带验光与推荐规则消费的几何、光学与价格字段；而知识条目或话术只携带标题、标签与正文。模块还必须沿用 rxlab 既有组合模式——host 数据行 + SPA 内嵌 headless Cordis 客户端运行时驱动的生成类型化 Remote namespace——且不得污染平台通用客户端装配。

## 决策

以新官方双面包 `@deepseek-ai/dsh-rxlab-content` 交付内容管理，落在 `packages/api/`，原因同 catalog：api 组各 controller 包拥有 tsdown `clientBundle` 与 typert 生成链，bundle 组没有。

Host 侧数据经由 **storage domain** 形态（`ctx.storageDomain`）：`defineDomain` 声明 `rxlab_content`（version 1、`per-record` 布局，使每条条目为独立文档），单张 `items` 表，zod schema 为 `ContentItem = { id, kind: 'knowledge' | 'script', stage?, title, tags, body, updatedAt }`。域名为 `rxlab_content` 而非 `rxlab-content`：storage 单元名须匹配 `[a-z][a-z0-9_]*`。

`ContentController extends TypertRemoteService` 注册 `rxlabContent` Remote namespace（`super(ctx, 'contentController', { namespace: 'rxlabContent' })`），声明 `static inject = ['storageDomain']`，在 `[Service.init]` 打开域，暴露 `list`、`get`、`upsert`、`delete`。`list` 按封闭的 `kind` 与 `stage` 分面、以及标题/标签大小写不敏感子串过滤，返回按最近写入倒序、省略正文的摘要。`get` 对缺失 id 抛 `content/not-found`。`upsert` 在 wire 边界用域 zod schema 校验草稿，铸造条目 id 与写时间戳，并排入域的单写链；目标 id 是请求的兄弟字段（缺省新建、存在则替换），与 fitting Remote 一致，而非草稿字段。`delete` 报告条目是否存在。Wire 与持久类型是 `src/types.ts` 中的浏览器安全 JSON 类型；zod 仅存于 host 侧 `src/domain.ts`。

Client 侧本包是 `dsh.client` 行，其 `/client` bundle 自行 `$mount` 生成的 Remote contribution（`import contentRemote from '@deepseek-ai/dsh-rxlab-content/remote'`）。rxlab profile 照其他 rxlab 数据行组合它，于是 SPA 通用 headless boot 激活该 bundle、`remote.rxlabContent.*` 得以解析。平台 `api-remotes` 装配未改动。

`StageId` 联合（`exam | frame | lens | fabrication | pickup | aftercare`）本地声明而非从 job 域导入，与 catalog 复制 collector 的 `collectPlatform` 同理；job 包仍是权威，content 包保持独立。

## 备选方案

**把 namespace 加入平台 `api-remotes` 装配。** 该装配为每个 Client 选择通用 Host 能力；rxlab content 是产品域数据，会让平台被迫依赖 rxlab 包。改为本包通过自己的 `dsh.client` 行自 mount contribution，与 catalog、fitting 行一致。

**扩展现有 `rxlab_catalog` 域而非新增域。** catalog 的判别联合是商品主数据，携带 fitting 与推荐消费的几何、光学与价格历史；加入 `knowledge`/`script` 分支会放宽该联合，并迫使每个 catalog 消费方处理用不上的编辑类行。独立的 `rxlab_content` 域让每个域的 schema 保持封闭，SPA 也能独立呈现内容管理。

**从 `@deepseek-ai/dsh-rxlab-job/types` 导入 `StageId`。** 这会把本包耦合到并行工作流，并让 content 的可用性依赖 job 域，而六阶段词表已在工作台契约中冻结。复制该封闭联合让两包各自独立；catalog 复制 collector 的 `CollectPlatform` 是同样先例。

**自建 JSON 文件或直接用 sqlite。** storage-domain 形态已提供持久读边界的 zod 校验、同步内存读、每域单写链与 `domain/changed` 事件，且落在 rxlab 隔离的 `storages-rxlab` 根下；自建文件会重复这些保证。首版沿用 json 后端，后续仅需改路由即可让 `storage-sqlite` 支撑同一域。

## 结果

工作台现具备持久、类型化的内容 CRUD：浏览器 → `rxlabContent` Remote → `$DSH_HOME/storages-rxlab/` 下的 `rxlab_content` 记录。catalog 域保持纯商品，每个域的 schema 保持封闭。六阶段词表现存在于两个包，改动六个阶段须同时更新两处（job 包为权威）。rxlab-app profile 尚未组合该行，因此在工作台 SPA 集成加入它之前，没有 shipped profile 会加载该 controller。

## 测试

`tests/domain.spec.ts` 钉住域：未知 `kind` 与 `stage` 被拒、纯空白标题失败、缺省 stage 保持缺省、存储记录以铸造的 id 与 `updatedAt` 往返、且 `contentDomainSpec` 声明 `rxlab_content` version 1 与单张 `items` 表。`tests/content-controller.host.spec.ts` 在内存后端上启动真实 `ContentController` 与真实 storage-domain 设施，覆盖铸造 id/updatedAt 的新建、读回、按给定 id 替换、wire 边界拒绝（`gateway/bad-request`）、`content/not-found`、`list` 分面与排序（摘要省略正文），以及删除含「不存在即不写」的未命中分支。

## 延期

SPA 内容管理面板及其浏览器冒烟随工作台 SPA 改动落地；在那之前该 namespace 没有浏览器消费方。面板按需刷新列表而非订阅 `domain/changed`，大内容集也无全文本索引。
