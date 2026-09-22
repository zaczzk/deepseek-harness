/**
 * `enhance` namespace dictionaries: the preview popover's action labels,
 * accessibility names, and its single error line. State is conveyed by
 * colour, position, icon, and these labels only.
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'button.aria': '增强草稿',
  'buttonQuiet.aria': '增强草稿（可能已足够清晰）',
  'preview.aria': '增强预览',
  'ghost.aria': '流式改写',
  'action.accept': '接受',
  'action.dismiss': '忽略',
  'diff.aria': '改写差异',
  'error.preview': '增强失败，请重试。',
} satisfies Record<string, string>

/** The enhance namespace key union. */
export type EnhanceKey = keyof typeof zh

/** English dictionary. */
export const en: Record<EnhanceKey, string> = {
  'button.aria': 'Enhance draft',
  'buttonQuiet.aria': 'Enhance draft (may already be clear)',
  'preview.aria': 'Enhance preview',
  'ghost.aria': 'Streaming rewrite',
  'action.accept': 'Accept',
  'action.dismiss': 'Dismiss',
  'diff.aria': 'Rewrite diff',
  'error.preview': 'Enhancement failed. Try again.',
}
