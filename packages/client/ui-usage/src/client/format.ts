import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'

/**
 * Format one latency figure.
 * @param ms - average latency in milliseconds.
 * @param t - the meter's translate seat, which carries the latency templates.
 * @returns `860ms` below a second and `1.2s` above it.
 */
export function formatLatency(ms: number, t: TranslateNS<typeof NS>): string {
  return ms < 1_000
    ? t('latency.millis', { value: ms })
    : t('latency.seconds', { value: String(Math.round(ms / 100) / 10) })
}

/**
 * Format a token count with the shared compact K/M templates.
 * @param value - token count.
 * @param t - the meter's translate seat, which carries the common number templates.
 * @returns the compact localized count.
 */
export function formatTokens(value: number, t: TranslateNS<typeof NS>): string {
  const scaled = (unit: number): number => {
    const mantissa = value / unit
    return mantissa >= 100 ? Math.round(mantissa) : Math.round(mantissa * 10) / 10
  }
  if (value < 1_000) return String(value)
  return value < 1_000_000
    ? t('number.thousand', { value: scaled(1_000) })
    : t('number.million', { value: scaled(1_000_000) })
}
