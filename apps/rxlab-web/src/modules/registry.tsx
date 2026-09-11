import { lazy } from 'react'
import {
  BookOpen,
  Bot,
  ClipboardList,
  Eye,
  Glasses,
  HeartHandshake,
  PackageCheck,
  ScanFace,
  Settings,
  ShoppingCart,
  Wrench,
} from 'lucide-react'

import type { ModuleDefinition } from './types'

const jobsPanel = lazy(() => import('./jobs/Panel'))
export const jobDetailPanel = lazy(() => import('./jobs/JobDetail'))
const examPanel = lazy(() => import('./exam/Panel'))
const framePanel = lazy(() => import('./frame/Panel'))
const lensPanel = lazy(() => import('./lens/Panel'))
const fabricationPanel = lazy(() => import('./fabrication/Panel'))
const pickupPanel = lazy(() => import('./pickup/Panel'))
const aftercarePanel = lazy(() => import('./aftercare/Panel'))
const contentPanel = lazy(() => import('./content/Panel'))
const collectPanel = lazy(() => import('./collect/Panel'))
const agentPanel = lazy(() => import('./agent/Panel'))
const settingsPanel = lazy(() => import('./settings/Panel'))

/**
 * Workbench module manifest. `core` is the work-order surface the app is built
 * around; the six `stage` modules are views inside its workbench, not routes of
 * their own; `tool` modules are reached from the top bar's 更多 menu. Copy is zh
 * until the app gains a locale dictionary.
 */
export const MODULES: readonly ModuleDefinition[] = [
  {
    id: 'jobs',
    label: '工单总览',
    tagline: '消费者画像、阶段工作台、配镜指南与用量',
    description:
      '工单：以工单为单位的配镜编排域（rxlab_job）。创建工单录入消费者画像，在工单工作台内逐阶段写入确定性与人工产出，最终组装结构化配镜指南并可导出 HTML。',
    scope: [
      '工单列表、创建、编辑消费画像与对客价格',
      '工单工作台：六阶段切换、阶段产出与校验',
      '生成并渲染配镜指南、导出 HTML',
      '绑定工单会话、查看 token 与成本用量',
    ],
    icon: ClipboardList,
    status: 'active',
    group: 'core',
    panel: jobsPanel,
  },
  {
    id: 'exam',
    label: '验光',
    tagline: '录入验光事实，推导处方与配镜建议',
    description:
      '验光阶段：复用 rxlab_fitting 分阶段验光记录与确定性推导引擎，得出处方、折射率/镜片类型/镜架尺寸带建议，并把处方与校验结果写入工单阶段产出。',
    scope: ['分阶段验光记录录入与检索', '处方推导与过程校验（OK/WARN/FAIL）', '写入工单验光阶段产出'],
    icon: Glasses,
    status: 'active',
    group: 'stage',
    stage: 'exam',
    panel: examPanel,
  },
  {
    id: 'frame',
    label: '选框',
    tagline: '按处方目标校验候选镜架尺寸与框型',
    description:
      '选框阶段：从商品参照库或人工录入候选镜架，调用 rxlab-recommend 的 validateFrame / suggest 按处方瞳距与尺寸带做确定性校验与排序，写入选框阶段产出。',
    scope: ['候选镜架参照库选取与人工录入', '移心量 / 尺寸带 / 框型一致性校验', '推荐排序与选择写入工单阶段'],
    icon: ScanFace,
    status: 'active',
    group: 'stage',
    stage: 'frame',
    panel: framePanel,
  },
  {
    id: 'lens',
    label: '选片',
    tagline: '按处方与用途校验候选镜片折射率与功能',
    description:
      '选片阶段：从商品参照库或人工录入候选镜片，调用 rxlab-recommend 的 validateLens / suggest 校验折射率、片型与功能适配，写入选片阶段产出。',
    scope: ['候选镜片参照库选取与人工录入', '折射率 / 片型 / 功能适配校验', '推荐排序与选择写入工单阶段'],
    icon: Eye,
    status: 'active',
    group: 'stage',
    stage: 'lens',
    panel: lensPanel,
  },
  {
    id: 'fabrication',
    label: '加工',
    tagline: '登记加工委托、镀膜清单与交期',
    description: '加工阶段（M1 壳）：登记加工方、边缘处理、镀膜与交期，产出完成后写入工单阶段产出。',
    scope: ['加工投入登记', '产出与交期记录', '阶段清单展示'],
    icon: Wrench,
    status: 'active',
    group: 'stage',
    stage: 'fabrication',
    panel: fabricationPanel,
  },
  {
    id: 'pickup',
    label: '取镜',
    tagline: '记录取镜交期、调整与交付人',
    description: '取镜阶段（M1 壳）：登记预约与实际取镜时间、调整记录与交付人，写入工单阶段产出。',
    scope: ['取镜预约登记', '调整与交付记录', '阶段清单展示'],
    icon: PackageCheck,
    status: 'active',
    group: 'stage',
    stage: 'pickup',
    panel: pickupPanel,
  },
  {
    id: 'aftercare',
    label: '售后',
    tagline: '记录保修与随访，沉淀护理清单',
    description: '售后阶段（M1 壳）：登记保修期限、护理要点与随访时间，写入工单阶段产出。',
    scope: ['保修 / 随访登记', '护理要点交代记录', '阶段清单展示'],
    icon: HeartHandshake,
    status: 'active',
    group: 'stage',
    stage: 'aftercare',
    panel: aftercarePanel,
  },
  {
    id: 'content',
    label: '内容管理',
    tagline: '参照库、知识与话术',
    description:
      '内容管理：参照库复用 rxlab_catalog（镜架 / 镜片 / 商品 master data，保留 CRUD）；知识与话术由 rxlab_content 域承载，按阶段与 kind 过滤。',
    scope: ['参照库条目 CRUD 与检索', '知识 / 话术条目 CRUD、阶段打标', '为阶段面板提供数据来源'],
    icon: BookOpen,
    status: 'active',
    group: 'tool',
    panel: contentPanel,
  },
  {
    id: 'collect',
    label: '采集',
    tagline: '平台/店铺/商品人工台账与助手草稿确认',
    description:
      '商品采集模块：以 平台 → 店铺 → 商品 组织的人工台账，所有字段由人工录入（单条或 CSV 批量）；采集助手只分析人工给出的材料并产出待确认草稿，人工逐条确认后才写入 rxlab_collect 域。不再自动抓取网页，无需浏览器，可由人工把条目导入商品 Wiki。',
    scope: [
      '平台/店铺登记与商品条目的人工录入、编辑与 CSV 批量导入',
      '按店铺浏览与检索商品台账，导入到商品 Wiki',
      '采集助手产出的待确认草稿逐条确认或拒绝',
    ],
    icon: ShoppingCart,
    status: 'active',
    group: 'tool',
    panel: collectPanel,
  },
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
    group: 'tool',
    panel: agentPanel,
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
    group: 'tool',
    panel: settingsPanel,
  },
]

/** Stable lookup by module id; the workspace route uses it to render panels. */
export function moduleById(id: string): ModuleDefinition | undefined {
  return MODULES.find(module => module.id === id)
}

/** The six stage modules in manifest order; they render inside the work-order workbench. */
export function stageModules(): readonly ModuleDefinition[] {
  return MODULES.filter(module => module.stage !== undefined)
}

/** The tool modules reached from the top bar's 更多 menu, `settings` included. */
export function toolModules(): readonly ModuleDefinition[] {
  return MODULES.filter(module => module.group === 'tool')
}

/** The workbench's landing route: the work-order overview. */
export function defaultModuleId(): string {
  return 'jobs'
}
