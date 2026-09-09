/**
 * Platform login detection for the collect agent browse tools. Each entry
 * names the manual-login entry page and the check that answers "signed in" —
 * the check runs in the page, so the person's headed login is verified on the
 * real session state, not on a stored token.
 * @module @deepseek-ai/dsh-rxlab-collect/src/browse/login
 */

import type { Page } from 'playwright'
import type { CollectPlatform } from '../types.ts'

/** Manual login flow for one platform. */
export interface LoginFlow {
  /** Page the headed login window opens on. */
  readonly entryUrl: string
  /** True when the page's session state reports signed in. */
  readonly loggedIn: (page: Page) => Promise<boolean>
}

/** Platforms shipping a manual login flow. */
const FLOWS: Partial<Record<CollectPlatform, LoginFlow>> = {
  jd: {
    entryUrl: 'https://passport.jd.com/new/login.aspx',
    async loggedIn(page: Page): Promise<boolean> {
      // `pt_key` is JD's logged-in token cookie (domain .jd.com); its presence
      // is the authoritative signal, unlike page text which the home page's
      // first screen or a post-login redirect can hide.
      const cookies = await page.context().cookies()
      return cookies.some(cookie => cookie.name === 'pt_key' && cookie.value.trim().length > 0)
    },
  },
}

/**
 * Resolve the login flow for one platform.
 * @param platform - the platform to log into.
 * @returns the flow, or undefined when the platform ships no flow yet.
 */
export function loginFlowOf(platform: CollectPlatform): LoginFlow | undefined {
  return FLOWS[platform]
}
