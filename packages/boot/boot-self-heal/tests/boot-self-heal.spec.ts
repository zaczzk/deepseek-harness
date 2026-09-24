import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import * as BootSelfHeal from '../src/index.ts'
import { inspectBootHealth } from '../src/manifest-checker.ts'
import { createBootSelfHealService } from '../src/service.ts'

describe('boot-self-heal manifest inspection and service', () => {
  it('detects missing client build record and web dist in clean temp directory', () => {
    const tempDir = join(tmpdir(), `dsh-test-boot-heal-${String(Date.now())}`)
    mkdirSync(tempDir, { recursive: true })
    try {
      const issues = inspectBootHealth(tempDir)
      expect(issues.some(i => i.code === 'MISSING_CLIENT_RECORD')).toBe(true)
      expect(issues.some(i => i.code === 'MISSING_CLIENT_BUNDLE')).toBe(true)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('detects corrupt JSON in client build record', () => {
    const tempDir = join(tmpdir(), `dsh-test-boot-heal-corrupt-${String(Date.now())}`)
    const buildDir = join(tempDir, '.dsh-build')
    mkdirSync(buildDir, { recursive: true })
    writeFileSync(join(buildDir, 'client-build-environment.json'), 'INVALID_JSON_CONTENT{')
    try {
      const issues = inspectBootHealth(tempDir)
      expect(issues.some(i => i.code === 'CORRUPT_CLIENT_RECORD')).toBe(true)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('detects stale client build record with zero artifacts', () => {
    const tempDir = join(tmpdir(), `dsh-test-boot-heal-stale-${String(Date.now())}`)
    const buildDir = join(tempDir, '.dsh-build')
    mkdirSync(buildDir, { recursive: true })
    writeFileSync(
      join(buildDir, 'client-build-environment.json'),
      JSON.stringify({ formatVersion: 1, artifacts: { fileCount: 0, sha256: 'abc' } }),
    )
    try {
      const issues = inspectBootHealth(tempDir)
      expect(issues.some(i => i.code === 'STALE_CLIENT_RECORD')).toBe(true)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('reports healthy when client record and web dist exist', () => {
    const tempDir = join(tmpdir(), `dsh-test-boot-heal-valid-${String(Date.now())}`)
    const buildDir = join(tempDir, '.dsh-build')
    const webDistDir = join(tempDir, 'apps/web/dist')
    mkdirSync(buildDir, { recursive: true })
    mkdirSync(webDistDir, { recursive: true })
    writeFileSync(
      join(buildDir, 'client-build-environment.json'),
      JSON.stringify({ formatVersion: 1, artifacts: { fileCount: 200, sha256: 'abc' } }),
    )
    writeFileSync(join(webDistDir, 'index.html'), '<!DOCTYPE html><html></html>')
    try {
      const issues = inspectBootHealth(tempDir)
      expect(issues.length).toBe(0)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('registers bootSelfHeal service on Cordis context', async () => {
    const ctx = new Context()
    await ctx.plugin(BootSelfHeal, { enabled: false })
    expect(ctx.bootSelfHeal).toBeDefined()
    expect(typeof ctx.bootSelfHeal?.inspectBootEnvironment).toBe('function')
    expect(typeof ctx.bootSelfHeal?.remediate).toBe('function')
  })

  it('returns clean report via service inspectBootEnvironment', async () => {
    const tempDir = join(tmpdir(), `dsh-test-service-${String(Date.now())}`)
    const buildDir = join(tempDir, '.dsh-build')
    const webDistDir = join(tempDir, 'apps/web/dist')
    mkdirSync(buildDir, { recursive: true })
    mkdirSync(webDistDir, { recursive: true })
    writeFileSync(
      join(buildDir, 'client-build-environment.json'),
      JSON.stringify({ formatVersion: 1, artifacts: { fileCount: 150, sha256: 'def' } }),
    )
    writeFileSync(join(webDistDir, 'index.html'), '<html></html>')
    try {
      const service = createBootSelfHealService()
      const report = await service.inspectBootEnvironment(tempDir)
      expect(report.healthy).toBe(true)
      expect(report.issues.length).toBe(0)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
