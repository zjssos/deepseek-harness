import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@deepseek-ai/dsh-rxlab-recommend',
  ['lib/types/index.js', 'lib/types/tools.js'],
  { hostPhase: true },
)
