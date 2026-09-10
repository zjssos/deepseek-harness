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

import type { ModuleDefinition, ModuleGroup } from './types'

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
 * Workbench module manifest. The primary rail is the work-order overview plus
 * the six-stage workflow; the secondary rail carries content/collect/agent/
 * settings tools. Copy is zh until the app gains a locale dictionary.
 */
export const MODULES: readonly ModuleDefinition[] = [
  {
    id: 'jobs',
    label: '工单总览',
    tagline: '消费者画像、阶段进度、配镜指南与用量',
    description:
      '工单总览：以工单为单位的配镜编排域（rxlab_job）。创建工单录入消费者画像，逐阶段写入确定性与人工产出，最终组装结构化配镜指南并可导出 HTML。',
    scope: [
      '工单列表、创建、编辑消费画像与对客价格',
      '六阶段进度总览与阶段面板跳转',
      '生成并渲染配镜指南、导出 HTML',
      '绑定工单会话、查看 token 与成本用量',
    ],
    icon: ClipboardList,
    status: 'active',
    group: 'stage',
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

/** Stable lookup by rail key; the workspace route uses it to render panels. */
export function moduleById(id: string): ModuleDefinition | undefined {
  return MODULES.find(module => module.id === id)
}

/** Modules of one rail group, in manifest order. */
export function modulesByGroup(group: ModuleGroup): readonly ModuleDefinition[] {
  return MODULES.filter(module => module.group === group)
}

/** The rail's first entry; used as the index redirect target. */
export function defaultModuleId(): string {
  return MODULES[0]?.id ?? 'jobs'
}
