#!/usr/bin/env npx tsx
import { getBrowserContext, navigateToTweet, runScript, ScriptResult } from '../lib/browser.js';

interface DraftReplyInput { tweet_url: string; reply: string; }

async function draftReply(input: DraftReplyInput): Promise<ScriptResult> {
  if (!input.tweet_url) return { success: false, message: 'Please provide a tweet URL' };
  if (!input.reply) return { success: false, message: 'Please provide a reply' };

  let context = null;
  try {
    context = await getBrowserContext();
    const { page, success, error } = await navigateToTweet(context, input.tweet_url);

    if (!success) {
      return { success: false, message: error || 'Navigation failed' };
    }

    // Get tweet author and snippet for context
    const tweet = page.locator('article[data-testid="tweet"]').first();
    const authorEl = tweet.locator('[data-testid="User-Name"] span').first();
    const author = await authorEl.textContent().catch(() => 'Unknown');
    const contentEl = tweet.locator('[data-testid="tweetText"]').first();
    const content = await contentEl.textContent().catch(() => '');

    return {
      success: true,
      message: 'Draft reply ready for approval',
      data: {
        tweet_url: input.tweet_url,
        tweet_author: author?.trim(),
        tweet_snippet: content?.trim().slice(0, 100),
        draft_reply: input.reply,
      }
    };
  } finally {
    if (context) await context.close();
  }
}

runScript<DraftReplyInput>(draftReply);
