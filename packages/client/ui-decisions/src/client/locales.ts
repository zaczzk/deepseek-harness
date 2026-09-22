/** `decisions` namespace dictionaries for the Decisions conversation view. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'decisions'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'view.decisions': '决策记录',
  'column.id': '编号',
  'column.date': '日期',
  'column.kind': '类型',
  'column.title': '主题',
  'column.status': '状态',
  'column.diagram': '架构图',
  'kind.decision': '决策',
  'kind.milestone': '里程碑',
  'status.proposed': '待定',
  'status.accepted': '已采纳',
  'status.superseded': '已取代',
  'status.done': '已完成',
  'diagram.updated': '已更新',
  'diagram.stale': '未更新',
  'diagram.absent': '缺少',
  'diagram.none': '—',
  'error.missing': '请在工作区根目录创建 DECISIONS.md。',
  'error.read': '无法读取 DECISIONS.md。',
  'retry': '重试',
  'loading': '加载中…',
  'empty': '暂无记录。',
} satisfies Record<string, string>

/** The decisions namespace key union. */
export type DecisionsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'view.decisions': 'Decisions',
  'column.id': 'ID',
  'column.date': 'Date',
  'column.kind': 'Kind',
  'column.title': 'Title',
  'column.status': 'Status',
  'column.diagram': 'Diagram',
  'kind.decision': 'Decision',
  'kind.milestone': 'Milestone',
  'status.proposed': 'Proposed',
  'status.accepted': 'Accepted',
  'status.superseded': 'Superseded',
  'status.done': 'Done',
  'diagram.updated': 'Updated',
  'diagram.stale': 'Stale',
  'diagram.absent': 'Absent',
  'diagram.none': '—',
  'error.missing': 'Create DECISIONS.md in the workspace root.',
  'error.read': 'DECISIONS.md could not be read.',
  'retry': 'Retry',
  'loading': 'Loading…',
  'empty': 'No register entries.',
} satisfies Record<DecisionsKey, string>
