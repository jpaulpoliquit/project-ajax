/**
 * Re-export the Telegram webhook handler from webhook/api.
 * Vercel expects api/ at project root; our implementation lives in webhook/.
 */
export { default } from "../webhook/api/telegram";
