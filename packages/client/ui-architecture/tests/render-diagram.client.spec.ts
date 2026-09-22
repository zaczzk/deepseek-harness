/** Mermaid loading and SVG rendering through the bundled browser instance. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('mermaid/dist/mermaid.min.js', () => ({}))

interface MermaidStub {
  initialize: ReturnType<typeof vi.fn>
  render: ReturnType<typeof vi.fn>
}

function installMermaid(stub: MermaidStub | undefined): void {
  const target = globalThis as { mermaid?: MermaidStub }
  if (stub === undefined) delete target.mermaid
  else target.mermaid = stub
}

async function freshRenderer(): Promise<typeof import('../src/client/render-diagram.ts')> {
  vi.resetModules()
  return import('../src/client/render-diagram.ts')
}

beforeEach(() => {
  installMermaid(undefined)
})

describe('renderMermaidSvg', () => {
  it('initializes the bundle instance once and renders SVG', async () => {
    const stub: MermaidStub = {
      initialize: vi.fn(),
      render: vi.fn(async () => ({ svg: '<svg>ok</svg>' })),
    }
    installMermaid(stub)
    const { renderMermaidSvg } = await freshRenderer()

    await expect(renderMermaidSvg('graph TD; A-->B')).resolves.toBe('<svg>ok</svg>')
    await expect(renderMermaidSvg('graph TD; A-->C')).resolves.toBe('<svg>ok</svg>')

    expect(stub.initialize).toHaveBeenCalledOnce()
    expect(stub.initialize).toHaveBeenCalledWith({ startOnLoad: false, securityLevel: 'strict' })
    const [firstId, secondId] = stub.render.mock.calls.map(call => call[0] as string)
    expect(firstId).not.toBe(secondId)
    expect(stub.render.mock.calls.map(call => call[1])).toEqual(['graph TD; A-->B', 'graph TD; A-->C'])
  })

  it('rejects when the bundle installs no mermaid instance', async () => {
    const { renderMermaidSvg } = await freshRenderer()

    await expect(renderMermaidSvg('graph TD;')).rejects.toThrow('did not install globalThis.mermaid')
  })

  it('propagates a source the renderer rejects', async () => {
    const stub: MermaidStub = {
      initialize: vi.fn(),
      render: vi.fn(async () => { throw new Error('parse failure') }),
    }
    installMermaid(stub)
    const { renderMermaidSvg } = await freshRenderer()

    await expect(renderMermaidSvg('not a diagram')).rejects.toThrow('parse failure')
  })
})
