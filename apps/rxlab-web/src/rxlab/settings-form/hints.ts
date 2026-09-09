/**
 * Field hints for the rxlab-workbench module settings surfaces (the settings
 * hub and the agent module's settings dialog). Keys are exact config field
 * names of each registered settings namespace; see llm-deepseek's Config and
 * agent-default-model's AGENT_DEFAULT_MODEL_SETTINGS_SCHEMA. zh copy until the
 * app gains a locale dictionary.
 */
import type { NamespaceDescriptor } from './types'

const THINKING_OPTIONS = [
  { value: 'enabled', label: '开启' },
  { value: 'disabled', label: '关闭' },
]

const EFFORT_OPTIONS = [
  { value: 'off', label: 'off（不思考）' },
  { value: 'low', label: 'low（低）' },
  { value: 'high', label: 'high（高）' },
  { value: 'max', label: 'max（最高）' },
]

/** Optional reasoning-effort choices with a "not set" slot for optional fields. */
const EFFORT_OPTIONS_UNSET = [{ value: '', label: '不设置' }, ...EFFORT_OPTIONS]

/** `llm-deepseek` namespace: the DeepSeek provider route's deployment knobs. */
export const llmDeepseekDescriptor: NamespaceDescriptor = {
  ns: 'llm-deepseek',
  title: 'DeepSeek 模型提供方',
  fields: {
    apiKeyEnv: {
      label: 'API Key 环境变量名',
      control: 'text',
      help: '适配器按此名读取凭据；默认 DEEPSEEK_API_KEY。',
    },
    baseURL: {
      label: '接口 Base URL',
      control: 'text',
      help: '留空使用默认公共端点（或 $DEEPSEEK_BASE_URL）。',
    },
    thinking: {
      label: '思考模式',
      control: 'select',
      options: THINKING_OPTIONS,
      help: 'disabled 时每条请求的思考都被限制为 off。',
    },
    reasoningEffort: {
      label: '思考强度（默认）',
      control: 'select',
      options: EFFORT_OPTIONS,
      help: '请求级默认思考强度；off 表示该请求不思考。',
    },
    maxTokens: {
      label: '输出上限',
      control: 'number',
      unit: 'tokens',
      help: '单请求输出上限，默认 256000。',
    },
    defaultContextWindow: {
      label: '上下文容量',
      control: 'number',
      unit: 'tokens',
      help: '所选模型无精确上下文值时使用的容量，默认 1,000,000。',
    },
    models: {
      label: '模型目录',
      control: 'readonly',
      help: '发现面展示的模型清单；编辑模型需改 settings-rxlab.yaml。',
    },
  },
}

/** `agent-default-model` namespace: the model new sessions start with. */
export const agentDefaultModelDescriptor: NamespaceDescriptor = {
  ns: 'agent-default-model',
  title: '默认模型（新建会话）',
  fields: {
    provider: {
      label: '模型提供方',
      control: 'text',
      help: '已注册的 provider route，如 deepseek-official。',
    },
    model: {
      label: '模型 id',
      control: 'text',
      help: '提供方拥有的模型 id，如 deepseek-v4-flash。',
    },
    reasoningEffort: {
      label: '思考强度（默认）',
      control: 'select',
      options: EFFORT_OPTIONS_UNSET,
      help: '不设置时跟随提供方行为。',
    },
  },
}

const LAUNCH_MODE_OPTIONS = [
  { value: 'persistent', label: '持久（自带 chromium + 登录 profile）' },
  { value: 'cdp', label: 'CDP（连接真实浏览器）' },
]

/** `rxlab-collect-browser` namespace: the collect module's browser knobs. */
export const collectBrowserDescriptor: NamespaceDescriptor = {
  ns: 'rxlab-collect-browser',
  title: '采集浏览器',
  fields: {
    launchMode: {
      label: '浏览器模式',
      control: 'select',
      options: LAUNCH_MODE_OPTIONS,
      help: '采集默认用自带无头 chromium(不弹窗);设为 CDP 后采集才 attach 到 cdpEndpoint 的真实浏览器。「打开 CDP 浏览器」用于 agent 浏览与人工登录,不会让采集自动切过去。浏览器模式变更对 agent 浏览工具需重启生效。',
    },
    cdpEndpoint: {
      label: 'CDP 端点',
      control: 'text',
      help: '真实浏览器的远程调试端点，默认 http://127.0.0.1:9222。',
    },
    executablePath: {
      label: '浏览器可执行文件路径',
      control: 'text',
      help: 'CDP「打开」时启动的可执行文件（Chrome/Edge）；留空时用 Playwright 自带 chromium。',
    },
    profileDir: {
      label: '登录 profile 目录',
      control: 'text',
      help: '持久模式保存平台登录态的 user-data 目录。',
    },
    headless: {
      label: '无头运行',
      control: 'boolean',
      help: '持久模式 agent 浏览是否无头；登录流程会临时打开有头窗口。',
    },
    navigateDelayMs: {
      label: '页面间隔',
      control: 'number',
      unit: 'ms',
      help: '浏览工具每次加载后的礼貌停顿。',
    },
  },
}
