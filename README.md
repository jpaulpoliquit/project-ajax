# Worker

Experimental worker project built with the project-ajax SDK.

## Workers

| Worker | Path | Tools |
|--------|------|-------|
| **Summarize** | `src/workers/summarize.ts` | `summarizePage` – Fetch URL content and return AI summary |
| **Telegram** | `src/workers/telegram/` | 30+ tools – updates, files, chat, messages, media, bot, forum. See `src/workers/telegram/README.md` |

## Setup

1. Authenticate with npm:
   ```bash
   npm login
   ```

2. Initialize the project:
   ```bash
   npm init @project-ajax@latest -- --directory .
   npm install
   ```

3. After initialization, the SDK documentation will be available in:
   - `README.md` - Overview of worker capabilities and CLI commands
   - `CLAUDE.md` - Condensed patterns for building workers
   - `node_modules/@project-ajax/sdk/src/` - SDK source code with JSDoc comments

## Telegram Worker

For Telegram tools, set `TELEGRAM_BOT_TOKEN` (get a token from [@BotFather](https://t.me/BotFather)). Add the bot to a group to access messages and files. Files are identified by `file_id` (session) and `file_unique_id` (persistent).

## Development

```bash
npm run dev      # Run worker locally
npm run check    # Type-check the code
npm run deploy   # Deploy worker (opens browser for authentication)
```
