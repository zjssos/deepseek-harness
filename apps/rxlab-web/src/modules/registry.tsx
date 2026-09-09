import { lazy } from 'react'
import {
  BadgeCheck,
  BookOpen,
  Bot,
  Glasses,
  Image,
  Settings,
  ShoppingCart,
  Workflow,
} from 'lucide-react'

import type { ModuleDefinition } from './types'

const agentPanel = lazy(() => import('./agent/Panel'))
const collectPanel = lazy(() => import('./collect/Panel'))
const wikiPanel = lazy(() => import('./wiki/Panel'))
const fittingPanel = lazy(() => import('./fitting/Panel'))
const recommendPanel = lazy(() => import('./recommend/Panel'))
const renderPanel = lazy(() => import('./render/Panel'))
const flowPanel = lazy(() => import('./flow/Panel'))
const settingsPanel = lazy(() => import('./settings/Panel'))

/**
 * Workbench module manifest. A module becomes usable by swapping its lazy
 * `Panel` for a real implementation and later registering the host-side tool /
 * data rows that back it. Copy is zh until the app gains a locale dictionary.
 */
export const MODULES: readonly ModuleDefinition[] = [
  {
    id: 'agent',
    label: '会话 Agent',
    tagline: '与配镜 agent 对话、查看运行过程与设置',
    description:
      'agent 会话能力：SPA 内嵌 headless Cordis 客户端数据层（由 dsh rxlab profile 的 modules 行提供运行时与 /plugins 数据行），三栏工作台完成会话管理、消息收发、模型选择与 API key 配置。',
    scope: [
      '会话列表、新建、打开、重命名、归档（隐藏）与分支（Fork）',
      '消息发送/停止、运行/队列态与队列项操作',
      '消息渲染与工具摘要卡、历史分页',
      '模型目录与选择、API Key 凭据配置',
    ],
    icon: Bot,
    status: 'active',
    panel: agentPanel,
  },
  {
    id: 'collect',
    label: '采集',
    tagline: '平台/店铺/商品链接资产与确定性采集落盘',
    description:
      '商品采集模块：登记 平台 → 店铺 → 商品链接（单条或 CSV 批量），勾选成采集批次，由确定性 L1 采集器（headless 浏览器）逐条抓取标题、价格、购买链接等并落盘 rxlab_collect 原始域；无需模型 key，可重试与查看采集历史。',
    scope: [
      '平台/店铺/商品链接资产与 CSV 批量导入',
      '勾选链接成采集批次、逐条状态与失败重试',
      '采集记录（标题/价格/购买链接）落盘与历史查看',
    ],
    icon: ShoppingCart,
    status: 'active',
    panel: collectPanel,
  },
  {
    id: 'wiki',
    label: '商品 Wiki',
    tagline: '查询与沉淀商品、镜架、镜片信息',
    description:
      '商品 Wiki 模块：维护与检索结构化的商品 / 镜架 / 镜片 master data（rxlab_catalog 持久域，经 rxlabCatalog Remote 直连读写），作为后续验光推荐的数据底座。',
    scope: [
      '按镜架 / 镜片 / 采集商品过滤与检索',
      '新增、编辑、删除与详情查看',
      '刷新持久：数据落盘 $DSH_HOME/storages-rxlab/ 的 catalog 域',
    ],
    icon: BookOpen,
    status: 'active',
    panel: wikiPanel,
  },
  {
    id: 'fitting',
    label: '验光配镜',
    tagline: '验光数据录入、处方计算、适配建议',
    description:
      '验光配镜模块：录入验光单（球镜/柱镜/轴位等），结合商品 Wiki 与适配规则计算处方与镜架适配建议。',
    scope: ['验光单录入', '处方计算', '镜架适配建议'],
    icon: Glasses,
    status: 'planned',
    panel: fittingPanel,
  },
  {
    id: 'recommend',
    label: '推荐校验',
    tagline: '按验光结果与库存校验并推荐组合',
    description:
      '推荐校验模块：在候选商品与库存范围内按处方与规则校验可行性，给出推荐组合与理由。',
    scope: ['候选范围筛选', '可行性校验', '推荐组合与理由'],
    icon: BadgeCheck,
    status: 'planned',
    panel: recommendPanel,
  },
  {
    id: 'render',
    label: '效果图',
    tagline: '生成佩戴 / 商品效果图并展示',
    description:
      '效果图模块：为推荐组合生成佩戴或商品效果图，输出可视化产物并留存在流程结果中。',
    scope: ['效果图任务', '产物预览', '结果留存'],
    icon: Image,
    status: 'planned',
    panel: renderPanel,
  },
  {
    id: 'flow',
    label: '流程 / 结果',
    tagline: '整条配镜流程状态与结果汇总',
    description:
      '流程结果模块：以交互结果页汇总一次配镜请求的完整链路状态与各模块产物，便于复盘与流转。',
    scope: ['流程状态总览', '跨模块产物汇总', '交互结果页'],
    icon: Workflow,
    status: 'planned',
    panel: flowPanel,
  },
  {
    id: 'settings',
    label: '全局设置',
    tagline: '各模块设置与 Agent 预设管理',
    description:
      '全局设置模块：读取 settings-rxlab.yaml 的各模块分区（模型、Web 搜索/抓取等）并提供标量编辑，同时管理 Agent 预设目录（列表、默认、复制、删除）。',
    scope: [
      '各模块 settings 分区查看与编辑（即时生效 / 需重启）',
      'Agent 预设列表、设为默认、复制、删除',
    ],
    icon: Settings,
    status: 'active',
    panel: settingsPanel,
  },
]

/** Stable lookup by rail key; the workspace route uses it to render panels. */
export function moduleById(id: string): ModuleDefinition | undefined {
  return MODULES.find(module => module.id === id)
}

/** The rail's first entry; used as the index redirect target. */
export function defaultModuleId(): string {
  return MODULES[0]?.id ?? 'agent'
}
