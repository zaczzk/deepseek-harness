import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@deepseek-ai/dsh-api-session-query-controller',
  ['lib/types/index.js'],
  { hostPhase: true },
)