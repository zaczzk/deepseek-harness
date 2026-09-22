import { describe, expect, it } from 'vitest'
import {
  EnhanceError,
  dropUncitedLines,
  renderBundleText,
  renderEnhance,
  resolveEnhance,
  validateEnhanceConfig,
  validateSections,
} from '@deepseek-ai/dsh-enhance'
import type { EnhanceConfig } from '@deepseek-ai/dsh-enhance'

const PRINCIPLES = [
  { id: 'modularity', text: 'Prefer modular components.' },
  { id: 'minimal-tech-debt', text: 'Prefer maintained dependencies over hand-rolling.' },
]

/** Base rubric document; overrides replace whole top-level fields. */
function rawConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    principles: PRINCIPLES,
    skipPatterns: ['^ping$'],
    limits: { minDraftCharacters: 10, foldBelowCharacters: 30, splitAboveCharacters: 200, maxExamples: 2 },
    depths: {
      task: ['objective', 'acceptance'],
      spec: ['objective', 'context', 'constraints', 'acceptance', 'verification'],
      bundle: ['objective', 'context', 'constraints', 'acceptance', 'verification', 'goal', 'todos'],
    },
    defaultDepth: 'spec',
    outputLanguage: 'auto',
    ...overrides,
  }
}

const config: EnhanceConfig = validateEnhanceConfig(rawConfig())
const principleIds = new Set(['modularity', 'minimal-tech-debt'])

describe('validateEnhanceConfig', () => {
  it('accepts a complete document and resolves typed frozen values', () => {
    const resolved = validateEnhanceConfig(rawConfig({
      examples: [{
        input: 'Ship the landing page.',
        sections: {
          objective: 'Ship the landing page.',
          constraints: ['[principle:modularity] Prefer modular components.'],
          acceptance: ['Ship the landing page.'],
          verification: ['Confirm every acceptance criterion is satisfied before reporting completion.'],
          goal: { objective: 'Ship the landing page.', completionCriteria: ['Ship the landing page.'] },
          todos: ['Ship the landing page.'],
          context: 'Copy from the design file.',
        },
      }],
    }))
    expect(resolved.principles).toEqual(PRINCIPLES)
    expect(resolved.examples).toHaveLength(1)
    expect(resolved.skipPatterns.map(pattern => pattern.source)).toEqual(['^ping$'])
    expect(resolved.limits).toEqual({
      minDraftCharacters: 10, foldBelowCharacters: 30, splitAboveCharacters: 200, maxExamples: 2,
    })
    expect(resolved.depths['task']).toEqual(['objective', 'acceptance'])
    expect(resolved.defaultDepth).toBe('spec')
    expect(resolved.outputLanguage).toBe('auto')
    expect(Object.isFrozen(resolved)).toBe(true)
  })

  it('rejects a non-object document', () => {
    expect(() => validateEnhanceConfig([])).toThrow(EnhanceError)
    expect(() => validateEnhanceConfig('principles')).toThrow('the document must be an object')
  })

  it('reports unknown top-level fields', () => {
    expect(() => validateEnhanceConfig(rawConfig({ preset: 'shared' })))
      .toThrow('configuration: unknown field "preset"')
  })

  it('reports every principles violation', () => {
    expect(() => validateEnhanceConfig(rawConfig({ principles: [] })))
      .toThrow('principles: must be a non-empty array')
    expect(() => validateEnhanceConfig(rawConfig({ principles: ['modularity'] })))
      .toThrow('principles[0]: must be { id: <lowercase identifier>, text: <non-empty text> }')
    expect(() => validateEnhanceConfig(rawConfig({ principles: [{ id: 'Modularity', text: 'x' }] })))
      .toThrow('principles[0]: must be { id: <lowercase identifier>, text: <non-empty text> }')
    expect(() => validateEnhanceConfig(rawConfig({ principles: [{ id: 'modularity', text: '  ' }] })))
      .toThrow('principles[0]: must be { id: <lowercase identifier>, text: <non-empty text> }')
    expect(() => validateEnhanceConfig(rawConfig({
      principles: [{ id: 'modularity', text: 'a' }, { id: 'modularity', text: 'b' }],
    }))).toThrow('principles[1]: duplicate id "modularity"')
    expect(() => validateEnhanceConfig(rawConfig({ principles: [{ id: 'bad id', text: 'x' }] })))
      .toThrow('principles: must contain at least one valid principle')
  })

  it('reports every skipPatterns violation', () => {
    expect(() => validateEnhanceConfig(rawConfig({ skipPatterns: 'ping' })))
      .toThrow('skipPatterns: must be an array of regular-expression strings')
    expect(() => validateEnhanceConfig(rawConfig({ skipPatterns: [''] })))
      .toThrow('skipPatterns[0]: must be a non-empty regular-expression string')
    expect(() => validateEnhanceConfig(rawConfig({ skipPatterns: [42] })))
      .toThrow('skipPatterns[0]: must be a non-empty regular-expression string')
    expect(() => validateEnhanceConfig(rawConfig({ skipPatterns: ['('] })))
      .toThrow('skipPatterns[0]: not a valid regular expression: (')
  })

  it('reports every limits violation', () => {
    expect(() => validateEnhanceConfig(rawConfig({ limits: null })))
      .toThrow('limits: must be an object with minDraftCharacters, foldBelowCharacters, splitAboveCharacters, maxExamples')
    expect(() => validateEnhanceConfig(rawConfig({
      limits: { minDraftCharacters: '10', foldBelowCharacters: 30, splitAboveCharacters: 200, maxExamples: 2 },
    }))).toThrow('limits.minDraftCharacters: must be a positive safe integer')
    expect(() => validateEnhanceConfig(rawConfig({
      limits: { minDraftCharacters: 1.5, foldBelowCharacters: 30, splitAboveCharacters: 200, maxExamples: 2 },
    }))).toThrow('limits.minDraftCharacters: must be a positive safe integer')
    expect(() => validateEnhanceConfig(rawConfig({
      limits: { minDraftCharacters: 10, foldBelowCharacters: 0, splitAboveCharacters: 200, maxExamples: 2 },
    }))).toThrow('limits.foldBelowCharacters: must be a positive safe integer')
    expect(() => validateEnhanceConfig(rawConfig({
      limits: { minDraftCharacters: 10, foldBelowCharacters: 30, splitAboveCharacters: 200, maxExamples: -1 },
    }))).toThrow('limits.maxExamples: must be a non-negative safe integer')
    expect(() => validateEnhanceConfig(rawConfig({
      limits: { minDraftCharacters: 10, foldBelowCharacters: 30, splitAboveCharacters: 200, maxExamples: 1.5 },
    }))).toThrow('limits.maxExamples: must be a non-negative safe integer')
    expect(() => validateEnhanceConfig(rawConfig({
      limits: { minDraftCharacters: 40, foldBelowCharacters: 30, splitAboveCharacters: 200, maxExamples: 2 },
    }))).toThrow('limits: must satisfy minDraftCharacters <= foldBelowCharacters <= splitAboveCharacters')
  })

  it('accepts zero examples and reports every depths violation', () => {
    expect(validateEnhanceConfig(rawConfig({
      limits: { minDraftCharacters: 10, foldBelowCharacters: 30, splitAboveCharacters: 200, maxExamples: 0 },
    })).limits.maxExamples).toBe(0)
    expect(() => validateEnhanceConfig(rawConfig({ depths: {} })))
      .toThrow('depths: must be an object with at least one depth')
    expect(() => validateEnhanceConfig(rawConfig({ depths: 'task' })))
      .toThrow('depths: must be an object with at least one depth')
    expect(() => validateEnhanceConfig(rawConfig({ depths: { Task: ['objective', 'acceptance'] } })))
      .toThrow('depths.Task: depth name must be a lowercase identifier')
    expect(() => validateEnhanceConfig(rawConfig({ depths: { task: 'objective' } })))
      .toThrow('depths.task: must be a non-empty array of section ids')
    expect(() => validateEnhanceConfig(rawConfig({ depths: { task: ['objective', 'acceptance', 'outline'] } })))
      .toThrow('depths.task: unknown section "outline"')
    expect(() => validateEnhanceConfig(rawConfig({ depths: { task: ['objective', 'objective', 'acceptance'] } })))
      .toThrow('depths.task: duplicate section "objective"')
    expect(() => validateEnhanceConfig(rawConfig({ depths: { task: ['acceptance'] } })))
      .toThrow('depths.task: must include the objective and acceptance sections')
  })

  it('reports defaultDepth and outputLanguage violations', () => {
    expect(() => validateEnhanceConfig(rawConfig({ defaultDepth: 7 })))
      .toThrow('defaultDepth: must name a declared depth')
    expect(() => validateEnhanceConfig(rawConfig({ defaultDepth: 'outline' })))
      .toThrow('defaultDepth: must name a declared depth')
    expect(() => validateEnhanceConfig(rawConfig({ outputLanguage: 'fr' })))
      .toThrow('outputLanguage: must be "auto", "en", or "zh"')
  })

  it('reports every examples violation', () => {
    expect(() => validateEnhanceConfig(rawConfig({ examples: 'pair' })))
      .toThrow('examples: must be an array of { input, sections } pairs')
    expect(() => validateEnhanceConfig(rawConfig({
      examples: [
        { input: 'a', sections: { objective: 'a.', acceptance: ['a.'] } },
        { input: 'b', sections: { objective: 'b.', acceptance: ['b.'] } },
        { input: 'c', sections: { objective: 'c.', acceptance: ['c.'] } },
      ],
    }))).toThrow('examples: must contain at most limits.maxExamples (2) pairs')
    expect(() => validateEnhanceConfig(rawConfig({ examples: [{ input: ' ', sections: { objective: 'a.', acceptance: ['a.'] } }] })))
      .toThrow('examples[0]: must be { input: <non-empty text>, sections: <validated sections> }')
    expect(() => validateEnhanceConfig(rawConfig({
      examples: [{ input: 'a', sections: { objective: 'a.', acceptance: [], outline: 'x' } }],
    }))).toThrow('examples[0].sections: unknown section "outline"')
  })
})

describe('validateSections', () => {
  it('accepts minimal and complete sections', () => {
    expect(validateSections({ objective: 'a.', acceptance: ['a.'] }, principleIds)).toEqual([])
    expect(validateSections({
      objective: 'Ship it.',
      context: 'Copy from the design file.',
      constraints: ['[principle:modularity] Prefer modular components.'],
      acceptance: ['Ship it.'],
      verification: ['Check the build.'],
      goal: { objective: 'Ship it.', completionCriteria: ['Ship it.'] },
      todos: ['Ship it.'],
    }, principleIds)).toEqual([])
  })

  it('reports every section rule it owns', () => {
    expect(validateSections(null, principleIds)).toEqual(['sections: must be an object'])
    expect(validateSections({ objective: 'a.', acceptance: ['a.'], motto: 'ship' }, principleIds))
      .toEqual(['sections: unknown section "motto"'])
    expect(validateSections({ acceptance: ['a.'] }, principleIds))
      .toContain('sections.objective: must be non-empty text')
    expect(validateSections({ objective: 'a.', context: '  ', acceptance: ['a.'] }, principleIds))
      .toEqual(['sections.context: must be non-empty text when present'])
    expect(validateSections({ objective: 'a.', acceptance: ['a.'], constraints: 'modular' }, principleIds))
      .toEqual(['sections.constraints: must be a non-empty array when present'])
    expect(validateSections({ objective: 'a.', acceptance: ['a.'], constraints: [] }, principleIds))
      .toEqual(['sections.constraints: must be a non-empty array when present'])
    expect(validateSections({ objective: 'a.', acceptance: ['a.'], constraints: [7] }, principleIds))
      .toEqual(['sections.constraints[0]: must cite a configured principle as [principle:<id>] <text>'])
    expect(validateSections({ objective: 'a.', acceptance: ['a.'], constraints: ['Keep it modular.'] }, principleIds))
      .toEqual(['sections.constraints[0]: must cite a configured principle as [principle:<id>] <text>'])
    expect(validateSections({ objective: 'a.', acceptance: ['a.'], constraints: ['[principle:unknown] text'] }, principleIds))
      .toEqual(['sections.constraints[0]: must cite a configured principle as [principle:<id>] <text>'])
    expect(validateSections({ objective: 'a.', acceptance: ['a.'], constraints: ['[principle:Modularity] text'] }, principleIds))
      .toEqual(['sections.constraints[0]: must cite a configured principle as [principle:<id>] <text>'])
    expect(validateSections({ objective: 'a.', acceptance: ['a.'], constraints: ['[principle:modularity]  '] }, principleIds))
      .toEqual(['sections.constraints[0]: must cite a configured principle as [principle:<id>] <text>'])
    expect(validateSections({ objective: 'a.', acceptance: ['a.'], constraints: ['[principle:] text'] }, principleIds))
      .toEqual(['sections.constraints[0]: must cite a configured principle as [principle:<id>] <text>'])
  })

  it('reports acceptance, verification, todos, and goal rules', () => {
    expect(validateSections({ objective: 'a.' }, principleIds))
      .toEqual(['sections.acceptance: must be a non-empty array of non-blank strings'])
    expect(validateSections({ objective: 'a.', acceptance: ['a.', '  '] }, principleIds))
      .toEqual(['sections.acceptance: must be a non-empty array of non-blank strings'])
    expect(validateSections({ objective: 'a.', acceptance: ['a.'], verification: [] }, principleIds))
      .toEqual(['sections.verification: must be a non-empty array of non-blank strings when present'])
    expect(validateSections({ objective: 'a.', acceptance: ['a.'], doneLooksLike: [''] }, principleIds))
      .toEqual(['sections.doneLooksLike: must be a non-empty array of non-blank strings when present'])
    expect(validateSections({ objective: 'a.', acceptance: ['a.'], doneLooksLike: ['a.: met or unmet'] }, principleIds))
      .toEqual([])
    expect(validateSections({ objective: 'a.', acceptance: ['a.'], todos: [''] }, principleIds))
      .toEqual(['sections.todos: must be a non-empty array of non-blank strings when present'])
    expect(validateSections({ objective: 'a.', acceptance: ['a.'], goal: 'done' }, principleIds))
      .toEqual(['sections.goal: must be an object when present'])
    expect(validateSections({ objective: 'a.', acceptance: ['a.'], goal: { completionCriteria: ['a.'] } }, principleIds))
      .toEqual(['sections.goal.objective: must be non-empty text'])
    expect(validateSections({ objective: 'a.', acceptance: ['a.'], goal: { objective: 'a.', completionCriteria: [] } }, principleIds))
      .toEqual(['sections.goal.completionCriteria: must be a non-empty array of non-blank strings'])
  })
})

describe('resolveEnhance', () => {
  it('resolves the direction with an explicit enhance default', () => {
    expect(resolveEnhance({ draft: 'build the thing right now' }, config).direction).toBe('enhance')
    expect(resolveEnhance({ draft: 'build the thing right now', direction: 'compact' }, config).direction).toBe('compact')
  })

  it('rejects blank drafts and undeclared depths', () => {
    expect(() => resolveEnhance({ draft: '   ' }, config)).toThrow('the draft must contain non-whitespace text')
    expect(() => resolveEnhance({ draft: 'build the thing', depth: 'outline' }, config))
      .toThrow('unknown depth "outline"; declare one of: task, spec, bundle')
    expect(() => resolveEnhance({ draft: 'build the thing', depth: '__proto__' }, config))
      .toThrow('unknown depth "__proto__"; declare one of: task, spec, bundle')
  })

  it('resolves the declared depth and canonical section order', () => {
    expect(resolveEnhance({ draft: 'build the thing now' }, config)).toMatchObject({
      depth: 'spec',
      sections: ['objective', 'context', 'constraints', 'acceptance', 'verification'],
    })
    expect(resolveEnhance({ draft: 'build the thing now', depth: 'bundle' }, config)).toMatchObject({
      depth: 'bundle',
      sections: ['objective', 'context', 'constraints', 'acceptance', 'verification', 'goal', 'todos'],
    })
  })

  it('classifies routes with deterministic signals and names the matched rule', () => {
    expect(resolveEnhance({ draft: 'ping' }, config)).toMatchObject({ route: 'skip', matchedRule: 'skip-pattern:^ping$' })
    expect(resolveEnhance({ draft: 'short' }, config)).toMatchObject({ route: 'skip', matchedRule: 'min-draft-characters' })
    expect(resolveEnhance({ draft: 'fold this small request in' }, config))
      .toMatchObject({ route: 'fold', matchedRule: 'fold-below-characters' })
    expect(resolveEnhance({ draft: `build ${'extensive '.repeat(22)}now` }, config))
      .toMatchObject({ route: 'split', matchedRule: 'split-above-characters' })
    expect(resolveEnhance({ draft: 'build the settings page with proper structure now' }, config))
      .toMatchObject({ route: 'enhance', matchedRule: 'default' })
  })

  it('derives the body language and honors explicit overrides', () => {
    expect(resolveEnhance({ draft: '构建设置页面' }, config).outputLanguage).toBe('zh')
    expect(resolveEnhance({ draft: 'build the settings page' }, config).outputLanguage).toBe('en')
    const pinned = validateEnhanceConfig(rawConfig({ outputLanguage: 'zh' }))
    expect(resolveEnhance({ draft: 'build the settings page' }, pinned).outputLanguage).toBe('zh')
    const english = validateEnhanceConfig(rawConfig({ outputLanguage: 'en' }))
    expect(resolveEnhance({ draft: '构建设置页面' }, english).outputLanguage).toBe('en')
  })
})

describe('template pipeline', () => {
  it('renders the bundle-depth golden for one-sentence drafts', () => {
    const request = { draft: 'Add a settings page with save and cancel buttons.' }
    const spec = resolveEnhance({ ...request, depth: 'bundle' }, config)
    const bundle = renderEnhance({ ...request, depth: 'bundle' }, spec, config)
    expect(bundle.sections).toEqual({
      objective: 'Add a settings page with save and cancel buttons.',
      constraints: [
        '[principle:modularity] Prefer modular components.',
        '[principle:minimal-tech-debt] Prefer maintained dependencies over hand-rolling.',
      ],
      acceptance: ['Add a settings page with save and cancel buttons.'],
      verification: ['Confirm every acceptance criterion is satisfied before reporting completion.'],
      goal: {
        objective: 'Add a settings page with save and cancel buttons.',
        completionCriteria: ['Add a settings page with save and cancel buttons.'],
      },
      todos: ['Add a settings page with save and cancel buttons.'],
    })
    expect(renderBundleText(bundle)).toBe([
      'Objective:',
      'Add a settings page with save and cancel buttons.',
      '',
      'Constraints:',
      '- [principle:modularity] Prefer modular components.',
      '- [principle:minimal-tech-debt] Prefer maintained dependencies over hand-rolling.',
      '',
      'Acceptance criteria:',
      '- [ ] Add a settings page with save and cancel buttons.',
      '',
      'Verification:',
      '- Confirm every acceptance criterion is satisfied before reporting completion.',
      '',
      'Goal:',
      'Add a settings page with save and cancel buttons.',
      'Completion criteria:',
      '- Add a settings page with save and cancel buttons.',
      '',
      'Todos:',
      '- Add a settings page with save and cancel buttons.',
    ].join('\n'))
  })

  it('splits multi-sentence objectives and keeps extra paragraphs as context', () => {
    const request = { draft: 'Add a settings page. Keep it responsive.\n\nUse the existing dialog primitives.' }
    const spec = resolveEnhance(request, config)
    const bundle = renderEnhance(request, spec, config)
    expect(bundle.sections.objective).toBe('Add a settings page. Keep it responsive.')
    expect(bundle.sections.context).toBe('Use the existing dialog primitives.')
    expect(bundle.sections.acceptance).toEqual(['Add a settings page.', 'Keep it responsive.'])
    expect(renderBundleText(bundle)).toContain('Context:\nUse the existing dialog primitives.')
  })

  it('emits only the sections the depth selects', () => {
    const request = { draft: 'Add a settings page with save and cancel buttons.' }
    const spec = resolveEnhance({ ...request, depth: 'task' }, config)
    const bundle = renderEnhance({ ...request, depth: 'task' }, spec, config)
    expect(bundle.sections).toEqual({
      objective: 'Add a settings page with save and cancel buttons.',
      acceptance: ['Add a settings page with save and cancel buttons.'],
    })
    expect(renderBundleText(bundle)).toBe([
      'Objective:',
      'Add a settings page with save and cancel buttons.',
      '',
      'Acceptance criteria:',
      '- [ ] Add a settings page with save and cancel buttons.',
    ].join('\n'))
  })

  it('compacts to objective and acceptance regardless of depth', () => {
    const request = { draft: 'Add a settings page with save and cancel buttons.', direction: 'compact' as const }
    const spec = resolveEnhance({ ...request, depth: 'bundle' }, config)
    expect(spec.direction).toBe('compact')
    const bundle = renderEnhance({ ...request, depth: 'bundle' }, spec, config)
    expect(bundle.sections).toEqual({
      objective: 'Add a settings page with save and cancel buttons.',
      acceptance: ['Add a settings page with save and cancel buttons.'],
    })
  })

  it('renders the done-looks-like section with the localized score line', () => {
    const rubric = validateEnhanceConfig(rawConfig({
      depths: { spec: ['objective', 'acceptance', 'doneLooksLike'] },
      defaultDepth: 'spec',
    }))
    const request = { draft: 'Add a settings page. Keep it responsive.' }
    const bundle = renderEnhance(request, resolveEnhance(request, rubric), rubric)
    expect(bundle.sections.doneLooksLike).toEqual([
      'Add a settings page.',
      'Keep it responsive.',
      'Report each criterion as <criterion>: met or unmet.',
    ])
    const chinese = validateEnhanceConfig(rawConfig({
      depths: { spec: ['objective', 'acceptance', 'doneLooksLike'] },
      defaultDepth: 'spec',
      outputLanguage: 'zh',
    }))
    const zhBundle = renderEnhance(request, resolveEnhance(request, chinese), chinese)
    expect(zhBundle.sections.doneLooksLike?.at(-1)).toBe('逐条报告：<criterion>：met 或 unmet。')
    expect(renderBundleText(zhBundle)).toContain('完成时的样子:')
  })

  it('omits context for single-paragraph drafts and localizes body text', () => {
    const request = { draft: '添加设置页面。保留现有对话框组件。' }
    const spec = resolveEnhance({ ...request, depth: 'bundle' }, config)
    const bundle = renderEnhance({ ...request, depth: 'bundle' }, spec, config)
    expect(bundle.sections.context).toBeUndefined()
    expect(bundle.spec.outputLanguage).toBe('zh')
    expect(renderBundleText(bundle)).toBe([
      '目标:',
      '添加设置页面。保留现有对话框组件。',
      '',
      '约束:',
      '- [principle:modularity] Prefer modular components.',
      '- [principle:minimal-tech-debt] Prefer maintained dependencies over hand-rolling.',
      '',
      '验收标准:',
      '- [ ] 添加设置页面。',
      '- [ ] 保留现有对话框组件。',
      '',
      '验证:',
      '- 报告完成前确认每条验收标准均已满足。',
      '',
      '任务目标:',
      '添加设置页面。保留现有对话框组件。',
      '完成标准:',
      '- 添加设置页面。',
      '- 保留现有对话框组件。',
      '',
      '待办:',
      '- 添加设置页面。',
      '- 保留现有对话框组件。',
    ].join('\n'))
  })

  it('treats a paragraph that matches no sentence unit as one criterion', () => {
    const request = { draft: '!!!' }
    const spec = resolveEnhance({ ...request, depth: 'task' }, config)
    const bundle = renderEnhance({ ...request, depth: 'task' }, spec, config)
    expect(bundle.sections.acceptance).toEqual(['!!!'])
  })

  it('skips empty section lists in the text projection', () => {
    const text = renderBundleText({
      spec: resolveEnhance({ draft: 'ship the landing page now', depth: 'task' }, config),
      sections: {
        objective: 'Ship it.',
        constraints: [],
        acceptance: ['Ship it.'],
        verification: [],
        doneLooksLike: [],
        todos: [],
      },
    })
    expect(text).toBe('Objective:\nShip it.\n\nAcceptance criteria:\n- [ ] Ship it.')
  })
})

describe('dropUncitedLines', () => {
  it('keeps only cited lines with configured principle ids', () => {
    expect(dropUncitedLines([
      '[principle:modularity] Prefer modular components.',
      'Keep it modular.',
      '[principle:unknown] text',
      '[principle:minimal-tech-debt] Prefer maintained dependencies over hand-rolling.',
    ], principleIds)).toEqual([
      '[principle:modularity] Prefer modular components.',
      '[principle:minimal-tech-debt] Prefer maintained dependencies over hand-rolling.',
    ])
  })
})
