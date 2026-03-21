#!/usr/bin/env npx tsx
import { getBrowserContext, runScript, config, ScriptResult } from '../lib/browser.js';

interface CommentInput { post_url: string; comment: string; }

async function postComment(input: CommentInput): Promise<ScriptResult> {
  if (!input.post_url) return { success: false, message: 'Please provide a post URL' };
  if (!input.comment) return { success: false, message: 'Please provide a comment' };

  let context = null;
  try {
    context = await getBrowserContext();
    const page = context.pages()[0] || await context.newPage();

    await page.goto(input.post_url, { timeout: config.timeouts.navigation, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(config.timeouts.pageLoad);

    // Click comment button to open comment box
    const commentBtn = page.locator('button[aria-label*="Comment"], button[aria-label*="comment"]').first();
    await commentBtn.waitFor({ timeout: config.timeouts.elementWait });
    await commentBtn.click();
    await page.waitForTimeout(config.timeouts.afterClick);

    // Fill comment
    const commentBox = page.locator('.ql-editor[data-placeholder*="Add a comment"], [role="textbox"][aria-label*="Add a comment"]');
    await commentBox.first().waitFor({ timeout: config.timeouts.elementWait });
    await commentBox.first().click();
    await page.waitForTimeout(config.timeouts.afterClick / 2);
    await commentBox.first().fill(input.comment);
    await page.waitForTimeout(config.timeouts.afterFill);

    // Click submit
    const submitBtn = page.locator('button.comments-comment-box__submit-button');
    await submitBtn.waitFor({ timeout: config.timeouts.elementWait });
    await submitBtn.click();
    await page.waitForTimeout(config.timeouts.afterSubmit);

    return {
      success: true,
      message: `Comment posted: ${input.comment.slice(0, 50)}${input.comment.length > 50 ? '...' : ''}`
    };
  } finally {
    if (context) await context.close();
  }
}

runScript<CommentInput>(postComment);
