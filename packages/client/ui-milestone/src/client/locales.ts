/**
 * `milestone` namespace dictionaries for the project-milestone transcript node.
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'milestone'

/**
 * Simplified Chinese dictionary (the key-set source of truth). `id`, `title`
 * and `mark` interpolate verbatim from the milestone event and the keyed mark
 * vocabulary respectively.
 */
export const zh = {
  'node.title': '里程碑 {id}：{title}',
  'node.mark': '图表',
  'node.markTooltip': '图表标记：{mark}',
  'mark.updated': '已更新',
  'mark.stale': '未更新',
  'mark.absent': '缺少',
  'mark.none': '无图表',
}

/** Union of this namespace's dictionary keys. */
export type MilestoneKey = keyof typeof zh

/** English dictionary (same key set). */
export const en: Record<MilestoneKey, string> = {
  'node.title': 'Milestone {id}: {title}',
  'node.mark': 'Diagram',
  'node.markTooltip': 'Diagram mark: {mark}',
  'mark.updated': 'Updated',
  'mark.stale': 'Stale',
  'mark.absent': 'Absent',
  'mark.none': 'No diagram',
}
