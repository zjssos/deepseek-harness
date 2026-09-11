/**
 * The rxlab app's command-line provider: it parses the `dsh rxlab` /
 * `dsh --profile rxlab` flag family (`--host`, `--port`, `--trusted-host`,
 * `--no-open`) and its `--help` text, then provides the immutable values as
 * {@link RXLAB_STARTUP_SERVICE}. Ordinary rows inject that service before
 * reading it from lazy config.
 * @module @deepseek-ai/dsh-rxlab-app/startup
 */

import { Command } from 'commander'
import type { Context } from '@deepseek-ai/cordis'
import { parseCmdline } from '@deepseek-ai/dsh-cmdline'

/** Stable Cordis plugin name. */
export const name = 'rxlab-startup'

/** Services required before the flags can be resolved. */
export const inject = ['cmdlineArgs']

/** Service provided by this ordinary plugin and injected by flag-configured rows. */
export const RXLAB_STARTUP_SERVICE = 'rxlabStartup'

/** What the rxlab rows read from {@link RXLAB_STARTUP_SERVICE}. */
export interface RxlabStartupValues {
  /** Whether this invocation opens the default browser after startup. */
  openBrowser: boolean
  /** `--host`, absent when the invocation did not name one. */
  host?: string
  /** `--port`, absent when the invocation did not name one. */
  port?: number
  /** Explicit `--trusted-host` authorities, in argument order. */
  trustedHosts: string[]
}

/** The rxlab flag family, as commander parsed it. */
interface RxlabOptions {
  host?: string
  open: boolean
  port?: string
  trustedHost?: string[]
}

/**
 * This app's command: its flags, its description, and its help text.
 * @returns a fresh program, so one process can parse more than once (tests).
 */
function rxlabCommand(): Command {
  return new Command()
    .name('dsh --profile rxlab')
    .description('Serve the DeepSeek Harness rxlab browser UI.')
    .helpOption('-h, --help', 'show this help')
    .option('--host <host>', 'bind host')
    .option('--no-open', 'do not open the Web UI in the default browser')
    .option('--port <port>', 'listen port; pass 0 to let the OS pick a free one')
    .option('--trusted-host <authority...>', 'extra authority the /api browser-trust fence accepts (host or host:port; repeatable)')
    .addHelpText('after', `
Examples:
  dsh rxlab                                  serve on the composed host and port
  dsh rxlab --no-open                        serve without opening a browser
  dsh rxlab --port 8080                      serve on another port
`)
}

/**
 * Parse and provide the rxlab invocation as an ordinary Cordis service. The
 * command's action publishes the flags this invocation named; `--host 0.0.0.0`
 * or a non-numeric `--port` is a usage error, so on rejection (and on `--help`)
 * nothing is provided.
 * @param ctx - plugin context carrying the command line.
 */
export function apply(ctx: Context): void {
  const program = rxlabCommand()
  program.action(() => {
    const options = program.opts<RxlabOptions>()
    if (options.host === '0.0.0.0') {
      program.error('error: --host 0.0.0.0 is intentionally not supported yet for safety: it would expose remote code execution to the network; use 127.0.0.1 instead')
    }
    if (options.port !== undefined && !/^\d+$/.test(options.port)) {
      program.error(`error: --port must be a number, got ${JSON.stringify(options.port)}`)
    }
    ctx.provide(RXLAB_STARTUP_SERVICE, {
      openBrowser: options.open,
      ...options.host !== undefined && { host: options.host },
      ...options.port !== undefined && { port: Number(options.port) },
      trustedHosts: options.trustedHost ?? [],
    } satisfies RxlabStartupValues)
  })
  parseCmdline(ctx, program)
}
