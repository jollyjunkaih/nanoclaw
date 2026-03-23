import https from 'https';
import { Api, Bot } from 'grammy';

import {
  ASSISTANT_NAME,
  TELEGRAM_GROUP_BOTS,
  TRIGGER_PATTERN,
} from '../config.js';
import { readEnvFile } from '../env.js';
import { logger } from '../logger.js';
import { processImageFromUrl } from '../image.js';
import { registerChannel, ChannelOpts } from './registry.js';
import {
  Channel,
  OnChatMetadata,
  OnInboundMessage,
  RegisteredGroup,
} from '../types.js';

export interface TelegramChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
}

// ── JID helpers ──────────────────────────────────────────────────────
// JID format: "tg:CHATID" or "tg:CHATID:THREADID" (for forum topics)

function parseTelegramJid(jid: string): { chatId: string; threadId?: number } {
  const withoutPrefix = jid.replace(/^tg:/, '');
  const colonIdx = withoutPrefix.indexOf(':');
  if (colonIdx === -1) {
    return { chatId: withoutPrefix };
  }
  return {
    chatId: withoutPrefix.slice(0, colonIdx),
    threadId: parseInt(withoutPrefix.slice(colonIdx + 1), 10),
  };
}

function buildTelegramJid(chatId: number | string, threadId?: number): string {
  if (threadId !== undefined) {
    return `tg:${chatId}:${threadId}`;
  }
  return `tg:${chatId}`;
}

// ── Send helper ──────────────────────────────────────────────────────

/**
 * Send a message with Telegram Markdown parse mode, falling back to plain text.
 * Claude's output naturally matches Telegram's Markdown v1 format:
 *   *bold*, _italic_, `code`, ```code blocks```, [links](url)
 */
async function sendTelegramMessage(
  api: { sendMessage: Api['sendMessage'] },
  chatId: string | number,
  text: string,
  options: { message_thread_id?: number } = {},
): Promise<void> {
  try {
    await api.sendMessage(chatId, text, {
      ...options,
      parse_mode: 'Markdown',
    });
  } catch (err) {
    // Fallback: send as plain text if Markdown parsing fails
    logger.debug({ err }, 'Markdown send failed, falling back to plain text');
    await api.sendMessage(chatId, text, options);
  }
}

// ── Per-topic send bots ──────────────────────────────────────────────
// Send-only Api instances: one per agent folder for distinct bot identities

const topicSendBots = new Map<string, Api>(); // folder → Api

export async function initTopicSendBots(
  bots: Array<{ folder: string; token: string }>,
): Promise<void> {
  for (const { folder, token } of bots) {
    try {
      const api = new Api(token);
      const me = await api.getMe();
      topicSendBots.set(folder, api);
      logger.info(
        { folder, username: me.username, id: me.id },
        'Topic send bot initialized',
      );
    } catch (err) {
      logger.error({ folder, err }, 'Failed to initialize topic send bot');
    }
  }
  if (topicSendBots.size > 0) {
    logger.info(
      { count: topicSendBots.size },
      'Telegram topic send bots ready',
    );
  }
}

// ── Bot pool for agent teams ─────────────────────────────────────────
// Send-only Api instances (no polling) for swarm sub-agents

const poolApis: Api[] = [];
// Maps "{groupFolder}:{senderName}" → pool Api index for stable assignment
const senderBotMap = new Map<string, number>();
let nextPoolIndex = 0;

/**
 * Initialize send-only Api instances for the bot pool.
 * Each pool bot can send messages but doesn't poll for updates.
 */
export async function initBotPool(tokens: string[]): Promise<void> {
  for (const token of tokens) {
    try {
      const api = new Api(token);
      const me = await api.getMe();
      poolApis.push(api);
      logger.info(
        { username: me.username, id: me.id, poolSize: poolApis.length },
        'Pool bot initialized',
      );
    } catch (err) {
      logger.error({ err }, 'Failed to initialize pool bot');
    }
  }
  if (poolApis.length > 0) {
    logger.info({ count: poolApis.length }, 'Telegram bot pool ready');
  }
}

/**
 * Send a message via a pool bot assigned to the given sender name.
 * Assigns bots round-robin on first use; subsequent messages from the
 * same sender in the same group always use the same bot.
 * On first assignment, renames the bot to match the sender's role.
 * Supports forum topics via thread ID in the JID.
 */
export async function sendPoolMessage(
  chatId: string,
  text: string,
  sender: string,
  groupFolder: string,
): Promise<void> {
  if (poolApis.length === 0) {
    return;
  }

  const key = `${groupFolder}:${sender}`;
  let idx = senderBotMap.get(key);
  if (idx === undefined) {
    idx = nextPoolIndex % poolApis.length;
    nextPoolIndex++;
    senderBotMap.set(key, idx);
    try {
      await poolApis[idx].setMyName(sender);
      await new Promise((r) => setTimeout(r, 2000));
      logger.info(
        { sender, groupFolder, poolIndex: idx },
        'Assigned and renamed pool bot',
      );
    } catch (err) {
      logger.warn(
        { sender, err },
        'Failed to rename pool bot (sending anyway)',
      );
    }
  }

  const api = poolApis[idx];
  try {
    const { chatId: numericId, threadId } = parseTelegramJid(chatId);
    const sendOpts = threadId ? { message_thread_id: threadId } : {};
    const MAX_LENGTH = 4096;
    if (text.length <= MAX_LENGTH) {
      await api.sendMessage(numericId, text, sendOpts);
    } else {
      for (let i = 0; i < text.length; i += MAX_LENGTH) {
        await api.sendMessage(
          numericId,
          text.slice(i, i + MAX_LENGTH),
          sendOpts,
        );
      }
    }
    logger.info(
      { chatId, sender, poolIndex: idx, threadId, length: text.length },
      'Pool message sent',
    );
  } catch (err) {
    logger.error({ chatId, sender, err }, 'Failed to send pool message');
  }
}

// ── TelegramChannel ──────────────────────────────────────────────────

export class TelegramChannel implements Channel {
  name = 'telegram';

  private bot: Bot | null = null;
  private opts: TelegramChannelOpts;
  private botToken: string;

  constructor(botToken: string, opts: TelegramChannelOpts) {
    this.botToken = botToken;
    this.opts = opts;
  }

  /**
   * Get the correct Api for sending to a JID.
   * Looks up the registered group's folder, then checks for a dedicated
   * topic send bot. Falls back to the main bot.
   */
  private getApiForJid(jid: string): Api {
    const groups = this.opts.registeredGroups();
    const group = groups[jid];
    if (group) {
      const sendBot = topicSendBots.get(group.folder);
      if (sendBot) return sendBot;
    }
    return this.bot!.api;
  }

  async connect(): Promise<void> {
    this.bot = new Bot(this.botToken, {
      client: {
        baseFetchConfig: { agent: https.globalAgent, compress: true },
      },
    });

    // Initialize per-topic send bots from config
    if (TELEGRAM_GROUP_BOTS.length > 0) {
      await initTopicSendBots(TELEGRAM_GROUP_BOTS);
    }

    // Command to get chat ID (includes thread ID for forum topics)
    this.bot.command('chatid', (ctx) => {
      const chatId = ctx.chat.id;
      const chatType = ctx.chat.type;
      const threadId = ctx.message?.message_thread_id;
      const chatName =
        chatType === 'private'
          ? ctx.from?.first_name || 'Private'
          : (ctx.chat as any).title || 'Unknown';

      const jid = buildTelegramJid(chatId, threadId);
      const threadInfo = threadId ? `\nThread ID: ${threadId}` : '';

      ctx.reply(
        `Chat ID: \`${jid}\`\nName: ${chatName}\nType: ${chatType}${threadInfo}`,
        {
          parse_mode: 'Markdown',
          ...(threadId ? { message_thread_id: threadId } : {}),
        },
      );
    });

    // Command to check bot status
    this.bot.command('ping', (ctx) => {
      const threadId = ctx.message?.message_thread_id;
      ctx.reply(`${ASSISTANT_NAME} is online.`, {
        ...(threadId ? { message_thread_id: threadId } : {}),
      });
    });

    // Telegram bot commands handled above — skip them in the general handler
    // so they don't also get stored as messages. All other /commands flow through.
    const TELEGRAM_BOT_COMMANDS = new Set(['chatid', 'ping']);

    this.bot.on('message:text', async (ctx) => {
      if (ctx.message.text.startsWith('/')) {
        const cmd = ctx.message.text.slice(1).split(/[\s@]/)[0].toLowerCase();
        if (TELEGRAM_BOT_COMMANDS.has(cmd)) return;
      }

      const threadId = ctx.message.message_thread_id;
      const chatJid = buildTelegramJid(ctx.chat.id, threadId);
      // Also build a JID without thread for fallback lookup
      const chatJidNoThread = `tg:${ctx.chat.id}`;
      let content = ctx.message.text;
      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName =
        ctx.from?.first_name ||
        ctx.from?.username ||
        ctx.from?.id.toString() ||
        'Unknown';
      const sender = ctx.from?.id.toString() || '';
      const msgId = ctx.message.message_id.toString();

      // Determine chat name
      const chatName =
        ctx.chat.type === 'private'
          ? senderName
          : (ctx.chat as any).title || chatJid;

      // Translate Telegram @bot_username mentions into TRIGGER_PATTERN format.
      // Telegram @mentions (e.g., @andy_ai_bot) won't match TRIGGER_PATTERN
      // (e.g., ^@Andy\b), so we prepend the trigger when the bot is @mentioned.
      const botUsername = ctx.me?.username?.toLowerCase();
      if (botUsername) {
        const entities = ctx.message.entities || [];
        const isBotMentioned = entities.some((entity) => {
          if (entity.type === 'mention') {
            const mentionText = content
              .substring(entity.offset, entity.offset + entity.length)
              .toLowerCase();
            return mentionText === `@${botUsername}`;
          }
          return false;
        });
        if (isBotMentioned && !TRIGGER_PATTERN.test(content)) {
          content = `@${ASSISTANT_NAME} ${content}`;
        }
      }

      // Store chat metadata for discovery
      const isGroup =
        ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      this.opts.onChatMetadata(
        chatJid,
        timestamp,
        chatName,
        'telegram',
        isGroup,
      );

      // Only deliver full message for registered groups
      // Try thread-specific JID first, then fall back to plain chat JID
      const group =
        this.opts.registeredGroups()[chatJid] ||
        this.opts.registeredGroups()[chatJidNoThread];
      if (!group) {
        logger.debug(
          { chatJid, chatName },
          'Message from unregistered Telegram chat',
        );
        return;
      }

      // Use the JID that matched registration
      const matchedJid = this.opts.registeredGroups()[chatJid]
        ? chatJid
        : chatJidNoThread;

      // Deliver message — startMessageLoop() will pick it up
      this.opts.onMessage(matchedJid, {
        id: msgId,
        chat_jid: matchedJid,
        sender,
        sender_name: senderName,
        content,
        timestamp,
        is_from_me: false,
      });

      logger.info(
        { chatJid: matchedJid, chatName, sender: senderName, threadId },
        'Telegram message stored',
      );
    });

    // Handle non-text messages with placeholders so the agent knows something was sent
    const storeNonText = (ctx: any, placeholder: string) => {
      const threadId = ctx.message?.message_thread_id;
      const chatJid = buildTelegramJid(ctx.chat.id, threadId);
      const chatJidNoThread = `tg:${ctx.chat.id}`;

      const group =
        this.opts.registeredGroups()[chatJid] ||
        this.opts.registeredGroups()[chatJidNoThread];
      if (!group) return;

      const matchedJid = this.opts.registeredGroups()[chatJid]
        ? chatJid
        : chatJidNoThread;

      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName =
        ctx.from?.first_name ||
        ctx.from?.username ||
        ctx.from?.id?.toString() ||
        'Unknown';
      const caption = ctx.message.caption ? ` ${ctx.message.caption}` : '';

      const isGroup =
        ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      this.opts.onChatMetadata(
        chatJid,
        timestamp,
        undefined,
        'telegram',
        isGroup,
      );
      this.opts.onMessage(matchedJid, {
        id: ctx.message.message_id.toString(),
        chat_jid: matchedJid,
        sender: ctx.from?.id?.toString() || '',
        sender_name: senderName,
        content: `${placeholder}${caption}`,
        timestamp,
        is_from_me: false,
      });
    };

    this.bot.on('message:photo', async (ctx) => {
      const threadId = ctx.message?.message_thread_id;
      const chatJid = buildTelegramJid(ctx.chat.id, threadId);
      const chatJidNoThread = `tg:${ctx.chat.id}`;

      const group =
        this.opts.registeredGroups()[chatJid] ||
        this.opts.registeredGroups()[chatJidNoThread];
      if (!group) return;

      const matchedJid = this.opts.registeredGroups()[chatJid]
        ? chatJid
        : chatJidNoThread;

      const caption = ctx.message.caption || '';
      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName =
        ctx.from?.first_name ||
        ctx.from?.username ||
        ctx.from?.id?.toString() ||
        'Unknown';
      const sender = ctx.from?.id?.toString() || '';
      const msgId = ctx.message.message_id.toString();

      const isGroup =
        ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      this.opts.onChatMetadata(
        chatJid,
        timestamp,
        undefined,
        'telegram',
        isGroup,
      );

      let imageData: string | undefined;
      let imageMediaType: string | undefined;

      try {
        const photos = ctx.message.photo;
        if (photos && photos.length > 0) {
          const largest = photos[photos.length - 1];
          const file = await ctx.api.getFile(largest.file_id);
          if (file.file_path) {
            const fileUrl = `https://api.telegram.org/file/bot${this.botToken}/${file.file_path}`;
            const processed = await processImageFromUrl(fileUrl);
            imageData = processed.data;
            imageMediaType = processed.mediaType;
            logger.info(
              { chatJid: matchedJid, fileId: largest.file_id },
              'Processed Telegram image',
            );
          }
        }
      } catch (err) {
        logger.warn(
          { chatJid: matchedJid, err },
          'Telegram image download failed, using placeholder',
        );
      }

      // If image processing succeeded, pass the caption as content (image travels separately).
      // If it failed, fall back to the [Photo] placeholder so context is not lost.
      const content = imageData
        ? caption
        : caption
          ? `[Photo] ${caption}`
          : '[Photo]';

      this.opts.onMessage(matchedJid, {
        id: msgId,
        chat_jid: matchedJid,
        sender,
        sender_name: senderName,
        content,
        timestamp,
        is_from_me: false,
        image_data: imageData,
        image_media_type: imageMediaType,
      });
    });
    this.bot.on('message:video', (ctx) => storeNonText(ctx, '[Video]'));
    this.bot.on('message:voice', (ctx) => storeNonText(ctx, '[Voice message]'));
    this.bot.on('message:audio', (ctx) => storeNonText(ctx, '[Audio]'));
    this.bot.on('message:document', (ctx) => {
      const name = ctx.message.document?.file_name || 'file';
      storeNonText(ctx, `[Document: ${name}]`);
    });
    this.bot.on('message:sticker', (ctx) => {
      const emoji = ctx.message.sticker?.emoji || '';
      storeNonText(ctx, `[Sticker ${emoji}]`);
    });
    this.bot.on('message:location', (ctx) => storeNonText(ctx, '[Location]'));
    this.bot.on('message:contact', (ctx) => storeNonText(ctx, '[Contact]'));

    // Handle errors gracefully
    this.bot.catch((err) => {
      logger.error({ err: err.message }, 'Telegram bot error');
    });

    // Start polling — returns a Promise that resolves when started
    return new Promise<void>((resolve) => {
      this.bot!.start({
        onStart: (botInfo) => {
          logger.info(
            { username: botInfo.username, id: botInfo.id },
            'Telegram bot connected',
          );
          console.log(`\n  Telegram bot: @${botInfo.username}`);
          console.log(
            `  Send /chatid to the bot to get a chat's registration ID\n`,
          );
          resolve();
        },
      });
    });
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.bot) {
      logger.warn('Telegram bot not initialized');
      return;
    }

    try {
      const { chatId, threadId } = parseTelegramJid(jid);
      const api = this.getApiForJid(jid);
      const sendOpts = threadId ? { message_thread_id: threadId } : {};

      // Telegram has a 4096 character limit per message — split if needed
      const MAX_LENGTH = 4096;
      if (text.length <= MAX_LENGTH) {
        await sendTelegramMessage(api, chatId, text, sendOpts);
      } else {
        for (let i = 0; i < text.length; i += MAX_LENGTH) {
          await sendTelegramMessage(
            api,
            chatId,
            text.slice(i, i + MAX_LENGTH),
            sendOpts,
          );
        }
      }
      logger.info(
        { jid, threadId, length: text.length },
        'Telegram message sent',
      );
    } catch (err) {
      logger.error({ jid, err }, 'Failed to send Telegram message');
    }
  }

  isConnected(): boolean {
    return this.bot !== null;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('tg:');
  }

  async disconnect(): Promise<void> {
    if (this.bot) {
      this.bot.stop();
      this.bot = null;
      logger.info('Telegram bot stopped');
    }
  }

  async setTyping(jid: string, isTyping: boolean): Promise<void> {
    if (!this.bot || !isTyping) return;
    try {
      const { chatId, threadId } = parseTelegramJid(jid);
      await this.bot.api.sendChatAction(chatId, 'typing', {
        ...(threadId ? { message_thread_id: threadId } : {}),
      });
    } catch (err) {
      logger.debug({ jid, err }, 'Failed to send Telegram typing indicator');
    }
  }
}

registerChannel('telegram', (opts: ChannelOpts) => {
  const envVars = readEnvFile(['TELEGRAM_BOT_TOKEN']);
  const token =
    process.env.TELEGRAM_BOT_TOKEN || envVars.TELEGRAM_BOT_TOKEN || '';
  if (!token) {
    logger.warn('Telegram: TELEGRAM_BOT_TOKEN not set');
    return null;
  }
  return new TelegramChannel(token, opts);
});
