import { lazy } from 'react'
import {
  BadgeCheck,
  BookOpen,
  Bot,
  Glasses,
  Image,
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
      'agent 会话能力：SPA 内嵌 headless Cordis 客户端数据层（由 dsh rxlab profile 的 modules 行提供运行时与 /plugins 数据行），三栏工作台完成会话管理、消息收发与模型选择。',
    scope: ['会话列表、新建、打开与重命名', '消息发送/停止与运行队列态', '消息渲染与工具摘要卡', '模型目录与选择'],
    icon: Bot,
    status: 'active',
    panel: agentPanel,
  },
  {
    id: 'collect',
    label: '采集',
    tagline: '从电商平台采集眼镜商品资料',
    description:
      '商品采集模块：抓取与清洗电商眼镜商品（主图、参数、价格、SKU），产出结构化商品条目进入商品 Wiki。',
    scope: ['商品源配置', '采集任务与进度', '字段清洗与入库'],
    icon: ShoppingCart,
    status: 'planned',
    panel: collectPanel,
  },
  {
    id: 'wiki',
    label: '商品 Wiki',
    tagline: '查询与沉淀商品、镜架、镜片信息',
    description:
      '商品 Wiki 模块：对采集入库的商品与镜架/镜片知识做统一检索与维护，作为后续验光推荐的数据底座。',
    scope: ['商品检索', '知识条目维护', '镜架/镜片参数库'],
    icon: BookOpen,
    status: 'planned',
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
]

/** Stable lookup by rail key; the workspace route uses it to render panels. */
export function moduleById(id: string): ModuleDefinition | undefined {
  return MODULES.find(module => module.id === id)
}

/** The rail's first entry; used as the index redirect target. */
export function defaultModuleId(): string {
  return MODULES[0]?.id ?? 'agent'
}
