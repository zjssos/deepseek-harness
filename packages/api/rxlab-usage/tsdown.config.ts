import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@deepseek-ai/dsh-rxlab-usage',
  ['lib/types/index.js', 'lib/types/types.js'],
  { hostPhase: true },
)
