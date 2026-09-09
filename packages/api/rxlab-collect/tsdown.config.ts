import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@deepseek-ai/dsh-rxlab-collect',
  ['lib/types/index.js', 'lib/types/browser.js', 'lib/types/browser-launch.js', 'lib/types/tools.js'],
  { hostPhase: true },
)
