# Notion Worker

Experimental Notion worker that takes a URL as input, fetches the page content, and returns a concise AI-generated summary (2-3 paragraphs).

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

## Development

```bash
npm run dev      # Run worker locally
npm run check    # Type-check the code
npm run deploy   # Deploy to Notion (opens browser for authentication)
```

## Goal

Build a Notion worker tool that:
- Takes a URL as input
- Fetches the page content
- Returns a concise AI-generated summary (2-3 paragraphs)
- Handles articles, blog posts, and documentation pages
