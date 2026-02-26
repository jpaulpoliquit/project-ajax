# Telegram Worker

Exhaustive Telegram Bot API integration. Add the bot to a group to access messages, files, and manage chats.

## Setup

1. Create a bot via [@BotFather](https://t.me/BotFather) on Telegram
2. Set `TELEGRAM_BOT_TOKEN` in your environment
3. Add the bot to your group(s)

### Reading message history while webhook is active

When the main bot uses a webhook (real-time ingestion), `telegramGetUpdates` returns 409 because Telegram delivers updates to only one destination. To read message history (e.g. for topic summarization), use a **second bot**:

1. Create a second bot via [@BotFather](https://t.me/BotFather)
2. Add it to the **same groups** as the main bot
3. Set `TELEGRAM_HISTORY_BOT_TOKEN` in your environment
4. **Do not** set a webhook on the history bot

The agent uses `telegramGetUpdates` (which reads from the history bot). Filter results by `chat_id` and `message_thread_id` (for forum topics) to get the relevant messages.

**Agent instructions for forum topics:** When replying to a message from a forum topic, always pass `message_thread_id` (Topic ID) to `telegramSendMessage` and other send tools. Get it from the Notion page's Topic ID property or from the triggering message. Without it, replies go to the default topic.

## Telegram → Notion Ingestion

**Two options:**

### Option A: Webhook (recommended – always-on)

A **separate** webhook service receives Telegram messages in real time and creates Notion pages. Deploy to Vercel:

> **⚠️ CRITICAL:** Do **not** call `telegramDeleteWebhook`. The webhook is required for real-time ingestion. If the agent deletes it, messages will stop creating Notion pages. Add to agent instructions: "Never call telegramDeleteWebhook. The webhook is always-on and must stay active."

```bash
cd webhook
vercel
```

See [webhook/README.md](../webhook/README.md) for full setup (env vars, database sharing, registering the webhook with Telegram).

### Option B: Polling via agent (scheduled)

Use `telegramIngestToNotion` when the Custom Agent runs on a schedule (e.g. every 5 min). Less real-time than the webhook.

1. **Share the database** with your Notion integration
2. **Set secrets**: `TELEGRAM_BOT_TOKEN`, `NOTION_API_TOKEN`
3. **Agent triggers**: Recurring (every 5 min) + Page added to database
4. **Instructions**: Call `telegramIngestToNotion` on schedule; process new pages when triggered
5. **Optional secret**: `TELEGRAM_NOTION_MAX_FILE_BYTES` to cap uploaded Telegram attachment size (default: `104857600` / 100 MB)

### Tool: telegramIngestToNotion

| Param | Type | Description |
|-------|------|-------------|
| `database_id` | string | Notion database ID (optional) |
| `limit` | number | Max updates to process (1–100, default 50) |
| `offset` | number | getUpdates offset to skip already-processed messages |

Returns `{ created, pages, last_offset }`. Use `last_offset` on the next run to avoid duplicates.

### Attachment upload behavior

- Incoming Telegram attachments (document/photo/video/audio/voice/video_note/animation/sticker) are uploaded directly to Notion via the File Upload API.
- Upload outcomes are written back into each page as JSON state (`uploaded`, `failed`, or `skipped` with reason).
- Successfully uploaded files are appended as Notion file blocks (`image`, `video`, `audio`, `pdf`, or `file`) so downstream agents can read them.

## File Identification

Files in Telegram are identified by:

| Field | Description |
|-------|-------------|
| `file_id` | Session identifier for downloading or reusing the file |
| `file_unique_id` | Persistent identifier across different bots |
| `file_size` | Size in bytes (optional) |
| `file_name` | Original filename for documents (optional) |
| `type` | `document`, `photo`, `video`, `audio`, `voice`, `video_note`, `animation`, `sticker` |

Use `telegramGetFile` with `file_id` to get the download URL (valid ~1 hour).

## Tools Reference

### Updates & Webhooks

| Tool | Description |
|------|-------------|
| `telegramGetUpdates` | Fetch recent updates using the history bot (`TELEGRAM_HISTORY_BOT_TOKEN`). Use this when the main bot has webhook active. |
| `telegramGetWebhookInfo` | Get current webhook status |
| `telegramSetWebhook` | Set webhook URL for receiving updates via HTTPS (supports `secret_token` for request verification) |
| `telegramDeleteWebhook` | Remove webhook (⚠️ do not use when webhook ingestion is active) |
| `telegramIngestToNotion` | Fetch updates, create Notion pages, and upload Telegram attachments to Notion file blocks |

### Files

| Tool | Description |
|------|-------------|
| `telegramGetFile` | Get file metadata and download URL by file_id |
| `telegramListChatFiles` | List files shared in a chat |

### Chat

| Tool | Description |
|------|-------------|
| `telegramGetChat` | Get information about a chat |
| `telegramGetChatMemberCount` | Get member count |
| `telegramGetChatMember` | Get info about a chat member |
| `telegramGetChatAdministrators` | List administrators |
| `telegramLeaveChat` | Leave a group/channel |
| `telegramPinChatMessage` | Pin a message |
| `telegramUnpinChatMessage` | Unpin a message (or all) |
| `telegramExportChatInviteLink` | Generate invite link |
| `telegramApproveChatJoinRequest` | Approve join request |
| `telegramDeclineChatJoinRequest` | Decline join request |

### Messages

| Tool | Description |
|------|-------------|
| `telegramSendMessage` | Send text message |
| `telegramForwardMessage` | Forward a message |
| `telegramCopyMessage` | Copy a message (no forward link) |
| `telegramEditMessageText` | Edit bot's text message |
| `telegramDeleteMessage` | Delete a message |
| `telegramSendChatAction` | Send typing/upload action |

### Media

| Tool | Description |
|------|-------------|
| `telegramSendPhoto` | Send photo |
| `telegramSendDocument` | Send document |
| `telegramSendVideo` | Send video |
| `telegramSendAudio` | Send audio |
| `telegramSendVoice` | Send voice message |
| `telegramSendSticker` | Send sticker |
| `telegramSendLocation` | Send location or live location |
| `telegramSendPoll` | Send poll |

### Bot

| Tool | Description |
|------|-------------|
| `telegramGetMe` | Get bot information |
| `telegramSetMyCommands` | Set bot menu commands |
| `telegramGetMyCommands` | Get bot commands |
| `telegramSetMyDescription` | Set bot description |

### Forum Topics

| Tool | Description |
|------|-------------|
| `telegramCreateForumTopic` | Create forum topic |
| `telegramEditForumTopic` | Edit topic name/icon |
| `telegramCloseForumTopic` | Close topic |
| `telegramDeleteForumTopic` | Delete topic |

## API Coverage

This worker covers the core Telegram Bot API methods. Additional methods (stickers, games, payments, business accounts, etc.) can be added as needed. See [Telegram Bot API](https://core.telegram.org/bots/api) for the full reference.

## Structure

```
telegram/
├── README.md       # This file
├── index.ts        # Main registration
├── api.ts          # API client
├── utils.ts        # File extraction helpers
└── tools/
    ├── index.ts
    ├── updates.ts  # getUpdates, webhooks
    ├── files.ts    # getFile, listChatFiles
    ├── chat.ts     # getChat, members, pin, invite
    ├── messages.ts # send, forward, copy, edit, delete
    ├── media.ts    # photo, video, document, audio, etc.
    ├── bot.ts      # getMe, commands, description
    └── forum.ts    # forum topics
```
