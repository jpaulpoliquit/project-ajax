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

3. **Set environment variables** in Vercel dashboard (Settings → Environment Variables):
   - `NOTION_API_TOKEN` – your Notion integration token
   - `TELEGRAM_BOT_TOKEN` – from @BotFather (enables 👀 emoji reaction as ack)
   - `NOTION_DATABASE_ID` – optional, default: `312009f00c208036be25c17b44b2c667`

4. **Share the Notion database** with your integration (Share → Invite → your integration).

5. **Register the webhook** with Telegram:
   ```bash
   npx workers exec telegramSetWebhook -d '{"url":"https://notionworkers.vercel.app/api/telegram"}'
   ```

6. **Delete webhook** to switch back to polling:
   ```bash
   npx workers exec telegramDeleteWebhook -d '{}'
   ```

## Flow

1. User sends message in Telegram
2. Telegram POSTs to your webhook URL
3. Webhook creates a Notion page in the database
4. Custom Agent triggers (Page added to database)
5. Agent processes the page and can reply via `telegramSendMessage`

## Custom Agent setup

- **Trigger**: Page added to database → select this database
- **Integrations**: Attach the Telegram worker (for `telegramSendMessage` if you want to reply)
- **Instructions**: Process the new page (message content, chat_id, etc.) and take action
