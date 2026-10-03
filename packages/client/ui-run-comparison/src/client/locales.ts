/** `runComparison` namespace dictionaries for the Run comparison conversation view. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'runComparison'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'view.tab': '运行对比',
  'picker.baseline': '基准运行',
  'picker.comparison': '对比运行',
  'picker.pending': '正在加载运行…',
  'picker.error.read': '无法读取运行列表',
  'picker.retry': '重试',
  'metric.turns': '轮次',
  'metric.toolCalls': '工具调用',
  'metric.inputTokens': '输入 tokens',
  'metric.outputTokens': '输出 tokens',
  'metric.wallClock': '墙钟时间',
  'metric.failures': '失败',
  'metric.unavailable': '不可用',
  'empty.noRun': '无可对比运行',
  'empty.noSelection': '选择对比运行',
  'empty.noBaseline': '选择基准运行',
  'empty.noTurns': '此运行没有已提交的轮次',
  'reason.disabled': '非已持久化运行',
  'error.read': '无法读取运行日志',
  'retry': '重试',
  'loading': '正在加载运行日志…',
} satisfies Record<string, string>

/** The run-comparison namespace key union. */
export type RunComparisonKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'view.tab': 'Run comparison',
  'picker.baseline': 'Baseline run',
  'picker.comparison': 'Comparison run',
  'picker.pending': 'Loading runs…',
  'picker.error.read': "Couldn't read the run list",
  'picker.retry': 'Retry',
  'metric.turns': 'Turns',
  'metric.toolCalls': 'Tool calls',
  'metric.inputTokens': 'Input tokens',
  'metric.outputTokens': 'Output tokens',
  'metric.wallClock': 'Wall-clock',
  'metric.failures': 'Failures',
  'metric.unavailable': 'Unavailable',
  'empty.noRun': 'No comparable run',
  'empty.noSelection': 'Select a comparison run',
  'empty.noBaseline': 'Select a baseline run',
  'empty.noTurns': 'This run has no committed turns',
  'reason.disabled': 'Not a persisted run',
  'error.read': "Couldn't read run logs",
  'retry': 'Retry',
  'loading': 'Loading run logs…',
} satisfies Record<RunComparisonKey, string>