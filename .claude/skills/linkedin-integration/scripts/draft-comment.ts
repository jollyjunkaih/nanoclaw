#!/usr/bin/env npx tsx
import { getBrowserContext, runScript, config, ScriptResult } from '../lib/browser.js';

interface DraftCommentInput { post_url: string; comment: string; }

async function draftComment(input: DraftCommentInput): Promise<ScriptResult> {
  if (!input.post_url) return { success: false, message: 'Please provide a post URL' };
  if (!input.comment) return { success: false, message: 'Please provide a comment' };

  let context = null;
  try {
    context = await getBrowserContext();
    const page = context.pages()[0] || await context.newPage();

    await page.goto(input.post_url, { timeout: config.timeouts.navigation, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(config.timeouts.pageLoad);

    // Verify post exists
    const postExists = await page.locator('.feed-shared-update-v2, .scaffold-finite-scroll__content').first().isVisible().catch(() => false);
    if (!postExists) {
      return { success: false, message: 'Post not found. URL may be invalid or post was deleted.' };
    }

    // Get post author and snippet for context
    const author = await page.locator('.update-components-actor__name span[aria-hidden="true"]').first().textContent().catch(() => 'Unknown');
    const content = await page.locator('.feed-shared-update-v2__description, .update-components-text').first().textContent().catch(() => '');

    return {
      success: true,
      message: `Draft comment ready for approval`,
      data: {
        post_url: input.post_url,
        post_author: author?.trim(),
        post_snippet: content?.trim().slice(0, 100),
        draft_comment: input.comment,
      }
    };
  } finally {
    if (context) await context.close();
  }
}

runScript<DraftCommentInput>(draftComment);
