# Workers

Each worker is a self-contained module with its own tools and documentation.

## Workers

| Worker | Path | Description |
|--------|------|-------------|
| **Summarize** | `summarize.ts` | Fetch URL content and return AI-generated summaries |
| **Telegram** | `telegram/` | Exhaustive Telegram Bot API – messages, files, chat management |

## Adding a Worker

1. Create a folder or file under `workers/`
2. Export a `register*` function that takes a `Worker` and registers tools
3. Import and call it from `workers/index.ts`
4. Add a README for the worker
