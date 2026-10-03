/**
 * `approval.rules` namespace dictionaries for the remembered-approval-rules
 * Settings section, its add/edit form, and the rule-answered transcript row.
 * The section and the transcript row share this namespace; item 12's readout
 * (registered by this same seat package) extends it with its own keys.
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'approval.rules'

/**
 * Simplified Chinese dictionary (the key-set source of truth). `{date}`
 * in `rules.expiry` is rendered by the locale runtime's date formatter,
 * never a raw `Date.toString()`; `{name}` in `transcript.rule` and
 * `{action}` in `rules.error` interpolate the answering rule name and the
 * keyed lowercase verb forms respectively.
 */
export const zh = {
  'nav': '审批规则与权限',
  'pending.read': '加载中…',
  'retry': '重试',
  'rules.empty': '暂无记住的规则',
  'rules.heading': '已记住的规则',
  'rules.name': '规则',
  'rules.tool': '工具',
  'rules.expiry': '{date} 到期',
  'rules.noExpiry': '永不过期',
  'rules.allow': '允许',
  'rules.deny': '拒绝',
  'rules.revoke': '撤销',
  'rules.add': '添加规则',
  'rules.edit': '编辑',
  'rules.form.label': '规则表单',
  'rules.save': '保存',
  'rules.cancel': '取消',
  'rules.save.pending': '正在保存…',
  'rules.dismiss': '关闭',
  'rules.error': '无法{action}规则',
  'rules.error.read': '无法读取规则',
  'rules.refreshError': '已保存，但无法刷新规则列表。',
  'rules.invalid': '请填写所有字段后再保存规则。',
  'rules.action.save': '保存',
  'rules.action.allow': '允许',
  'rules.action.deny': '拒绝',
  'rules.action.revoke': '撤销',
  'rules.form.name': '名称',
  'rules.form.tool': '工具',
  'rules.form.effect': '效果',
  'rules.form.expiry': '到期时间',
  'transcript.rule': '规则 {name} 应答',
  'transcript.rule.fold': '×{n}',
  'readout.subheading': '有效权限',
  'readout.sandboxMode': '沙箱模式',
  'readout.workspaceRoot': '工作区根目录',
  'readout.permission': '权限',
  'value.deploymentDefault': '部署默认值',
  'value.readOnly': '仅可查看',
  'value.workspaceWrite': '工作区内修改',
  'value.fullAccess': '完全权限',
  'value.auto': 'Auto review',
  'label.session': '会话：{name}',
  'label.sessionless': '未选择会话',
  'error.read': '无法读取有效值',
}

/** Union of this namespace's dictionary keys. */
export type ApprovalRulesKey = keyof typeof zh

/** English dictionary (same key set). */
export const en: Record<ApprovalRulesKey, string> = {
  'nav': 'Approval rules and permissions',
  'pending.read': 'Loading…',
  'retry': 'Retry',
  'rules.empty': 'No remembered rules yet',
  'rules.heading': 'Remembered rules',
  'rules.name': 'Rule',
  'rules.tool': 'Tool',
  'rules.expiry': 'Expires {date}',
  'rules.noExpiry': 'No expiry',
  'rules.allow': 'Allow',
  'rules.deny': 'Deny',
  'rules.revoke': 'Revoke',
  'rules.add': 'Add rule',
  'rules.edit': 'Edit',
  'rules.form.label': 'Rule form',
  'rules.save': 'Save',
  'rules.cancel': 'Cancel',
  'rules.save.pending': 'Saving…',
  'rules.dismiss': 'Dismiss',
  'rules.error': "Couldn't {action} the rule",
  'rules.error.read': "Couldn't read the rules",
  'rules.refreshError': "Saved, but the list couldn't refresh.",
  'rules.invalid': 'Complete every field to save the rule.',
  'rules.action.save': 'save',
  'rules.action.allow': 'allow',
  'rules.action.deny': 'deny',
  'rules.action.revoke': 'revoke',
  'rules.form.name': 'Name',
  'rules.form.tool': 'Tool',
  'rules.form.effect': 'Effect',
  'rules.form.expiry': 'Expiry',
  'transcript.rule': 'Answered by rule {name}',
  'transcript.rule.fold': '×{n}',
  'readout.subheading': 'Effective permissions',
  'readout.sandboxMode': 'Sandbox mode',
  'readout.workspaceRoot': 'Workspace root',
  'readout.permission': 'Permission',
  'value.deploymentDefault': 'deployment default',
  'value.readOnly': 'Read Only',
  'value.workspaceWrite': 'Workspace Write',
  'value.fullAccess': 'Full access',
  'value.auto': 'Auto review',
  'label.session': 'Session: {name}',
  'label.sessionless': 'No Session selected',
  'error.read': "Couldn't read effective values",
}
