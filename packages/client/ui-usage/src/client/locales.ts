/** `usage` namespace dictionaries: the Session-header token-usage meter. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'usage'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'panel.title': '代币用量',
  'panel.session': '会话',
  'panel.project': '项目',
  'panel.week': '周',
  'panel.month': '月',
  'panel.latency15': '延迟 15 分钟',
  'panel.latency60': '延迟 1 小时',
  'latency.millis': '{value}ms',
  'latency.seconds': '{value}s',
  'count': '{count} tok',
  'trigger.aria': '本会话已用 {tokens} tok',
  'limit.aria': '{period}额度已用 {percent}%',
} satisfies Record<string, string>

/** The usage namespace key union. */
export type UsageKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'panel.title': 'Token usage',
  'panel.session': 'Session',
  'panel.project': 'Project',
  'panel.week': 'Week',
  'panel.month': 'Month',
  'panel.latency15': 'Latency 15m',
  'panel.latency60': 'Latency 1h',
  'latency.millis': '{value}ms',
  'latency.seconds': '{value}s',
  'count': '{count} tok',
  'trigger.aria': '{tokens} tok used this session',
  'limit.aria': '{percent}% of the {period} limit',
} satisfies Record<UsageKey, string>
