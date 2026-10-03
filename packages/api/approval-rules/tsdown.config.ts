import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@deepseek-ai/dsh-api-approval-rules',
  ['lib/types/index.js'],
  { hostPhase: true },
)