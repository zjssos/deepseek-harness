import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@deepseek-ai/dsh-rxlab-catalog',
  ['lib/types/index.js'],
  { hostPhase: true },
)
