import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@deepseek-ai/dsh-rxlab-fitting',
  ['lib/types/index.js', 'lib/types/prescription.js'],
  { hostPhase: true },
)
