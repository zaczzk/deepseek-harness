import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'

/**
 * Compose one latency row value from its window average, tail, and first token.
 * @param avgMs - window average latency in milliseconds.
 * @param p95Ms - window tail latency in milliseconds.
 * @param ttftMs - window mean first-token latency in milliseconds.
 * @param t - the meter's translate seat, which carries the trio template.
 * @returns `1.2s · p95 3.1s · ttft 240ms`.
 */
export function formatLatencyTrio(avgMs: number, p95Ms: number, ttftMs: number, t: TranslateNS<typeof NS>): string {
  return t('latency.trio', {
    value: formatLatency(avgMs, t),
    p95: formatLatency(p95Ms, t),
    ttft: t('latency.millis', { value: ttftMs }),
  })
}

/**
 * Compose one latency row value from its window average and tail.
 * @param avgMs - window average latency in milliseconds.
 * @param p95Ms - window tail latency in milliseconds.
 * @param t - the meter's translate seat, which carries the pair template.
 * @returns `1.2s · p95 3.1s`.
 */
export function formatLatencyPair(avgMs: number, p95Ms: number, t: TranslateNS<typeof NS>): string {
  return t('latency.pair', { value: formatLatency(avgMs, t), p95: formatLatency(p95Ms, t) })
}

/**
 * Compose the plan reset date from the provider's naive period end.
 * @param resetsAt - the provider's `YYYY-MM-DD HH:mm:ss` period end.
 * @returns its `MM-DD` slice; the plan calendar keeps the year out of reach.
 */
export function formatPlanReset(resetsAt: string): string {
  return resetsAt.slice(5, 10)
}

/**
 * Compose the burn-runway figure beside a reset date.
 * @param days - projected days to exhaustion at the observed rate.
 * @param t - the meter's translate seat, which carries the runway template.
 * @returns `≈12d`.
 */
export function formatRunway(days: number, t: TranslateNS<typeof NS>): string {
  return t('burn.runway', { days })
}

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
