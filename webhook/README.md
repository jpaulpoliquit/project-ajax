# Telegram → Notion Webhook

**Always-on** listener: receives Telegram messages in real time and creates Notion pages. When a page is created, Custom Agents with a "Page added to database" trigger will run.

This is **separate** from the worker: the webhook runs on Vercel (or similar) 24/7; the Custom Agent only runs when triggered by new pages.

## Deploy to Vercel

**Vercel Root Directory must be `webhook/`** — Vercel only looks at this folder.

1. **Install Vercel CLI** (if needed):
   ```bash
   npm i -g vercel
   ```

2. **In Vercel project settings** → General → **Root Directory**: set to `webhook`

3. **Deploy** (from repo root; Vercel will use webhook/ as root):
   ```bash
   vercel
   ```

4. **Set environment variables** in Vercel dashboard (Settings → Environment Variables):
   - `NOTION_API_TOKEN` – your Notion integration token
   - `TELEGRAM_BOT_TOKEN` – from @BotFather (enables 👀 emoji reaction as ack)
   - `NOTION_DATABASE_ID` – optional, default: `312009f00c208036be25c17b44b2c667`
   - `TELEGRAM_NOTION_MAX_FILE_BYTES` – optional max Telegram attachment size to upload to Notion (default: `104857600` / 100 MB)
   - `TELEGRAM_WEBHOOK_SECRET_TOKEN` – **required for verification**. Must match the secret registered with Telegram.
   - `TELEGRAM_WEBHOOK_REQUIRE_SECRET_TOKEN` – set to `true` to enforce secret verification (reject requests without matching header).

5. **Share the Notion database** with your integration (Share → Invite → your integration).

6. **For topic summarization** (reading full message history): The webhook blocks getUpdates on the main bot. Use a **history bot** – see [src/workers/telegram/README.md](../src/workers/telegram/README.md) "Reading message history while webhook is active". Set `TELEGRAM_HISTORY_BOT_TOKEN` in the worker secrets. `telegramGetUpdates` uses this token.

7. **Optional:** Add filterable properties (Chat ID, Topic ID) to the Notion database for agent queries.

8. **Set webhook secret and register** with Telegram:
   ```bash
   # Generate a secret and set in worker secrets (used when registering webhook)
   npx workers secrets set TELEGRAM_WEBHOOK_SECRET_TOKEN=<your-secret> TELEGRAM_WEBHOOK_REQUIRE_SECRET_TOKEN=true

   # Register webhook (uses TELEGRAM_WEBHOOK_SECRET_TOKEN from secrets automatically)
   npx workers exec telegramSetWebhook -d '{"url":"https://notionworkers.vercel.app/api/telegram"}'
   ```
   Set the **same** `TELEGRAM_WEBHOOK_SECRET_TOKEN` and `TELEGRAM_WEBHOOK_REQUIRE_SECRET_TOKEN=true` in Vercel env vars. Telegram sends the secret in the `X-Telegram-Bot-Api-Secret-Token` header; the webhook rejects mismatches when `TELEGRAM_WEBHOOK_REQUIRE_SECRET_TOKEN=true`.

9. **Delete webhook** to switch back to polling:
   ```bash
   npx workers exec telegramDeleteWebhook -d '{}'
   ```

## Telegram privacy mode (important)

By default, **@mentioning the bot in plain text does NOT send the message to the bot**. Telegram's privacy mode only delivers:
- Commands like `/start`, `/summarize@notionworkerbot`
- Replies to the bot's messages

To receive all messages (including @mentions), disable privacy mode:

1. Open [@BotFather](https://t.me/BotFather) in Telegram
2. Send `/mybots` → select your bot
3. **Bot Settings** → **Group Privacy** → **Turn off**
4. **Remove the bot from the group and add it again** (required for the change to take effect)

## Flow

1. User sends message in Telegram
2. Telegram POSTs to your webhook URL
3. Webhook creates a Notion page in the database and stores Telegram state JSON
4. Attachments are uploaded directly to Notion File Upload API and appended as file/image/video/audio/pdf blocks
5. Custom Agent triggers (Page added to database)
6. Agent processes the page and can reply via `telegramSendMessage`

## Custom Agent setup

- **Trigger**: Page added to database → select this database
- **Integrations**: Attach the Telegram worker (for `telegramSendMessage` if you want to reply)
- **Instructions**: Process the new page (message content, chat_id, etc.) and take action
