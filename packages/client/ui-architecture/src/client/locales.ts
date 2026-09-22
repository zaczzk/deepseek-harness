/** `architecture` namespace dictionaries for the Architecture conversation view. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'architecture'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'view.architecture': '架构',
  'diagram.current': '架构图已更新',
  'diagram.stale': '架构图未更新',
  'diagram.absent': '缺少架构图',
  'diagram.stale.action': '请在下一个里程碑前更新 ARCHITECTURE.md 中的架构图。',
  'error.missing': '请在工作区根目录创建包含 mermaid 图的 ARCHITECTURE.md。',
  'error.noDiagram': '请在 ARCHITECTURE.md 中添加 mermaid 架构图。',
  'error.read': '无法读取 ARCHITECTURE.md。',
  'render.failed': '无法渲染该架构图。',
  'retry': '重试',
  'loading': '加载中…',
} satisfies Record<string, string>

/** The architecture namespace key union. */
export type ArchitectureKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'view.architecture': 'Architecture',
  'diagram.current': 'Diagram current',
  'diagram.stale': 'Diagram stale',
  'diagram.absent': 'No diagram',
  'diagram.stale.action': 'Update the diagram in ARCHITECTURE.md before the next milestone.',
  'error.missing': 'Create ARCHITECTURE.md in the workspace root with a mermaid diagram.',
  'error.noDiagram': 'Add a mermaid diagram to ARCHITECTURE.md.',
  'error.read': 'ARCHITECTURE.md could not be read.',
  'render.failed': 'The diagram could not be rendered.',
  'retry': 'Retry',
  'loading': 'Loading…',
} satisfies Record<ArchitectureKey, string>
