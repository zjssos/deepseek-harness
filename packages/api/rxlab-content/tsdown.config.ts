import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@deepseek-ai/dsh-rxlab-content',
  ['lib/types/index.js'],
  { hostPhase: true },
)
