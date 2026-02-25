/**
 * Main worker entry point
 * Registers all worker tools: summarize, telegram.
 */

import { Worker } from "@project-ajax/sdk";
import { registerSummarizeTool, registerTelegramTools } from "./workers/index.js";

const worker = new Worker();
export default worker;

// Summarize: fetch URLs and return AI summaries
registerSummarizeTool(worker);

// Telegram: access group messages and files via Bot API
registerTelegramTools(worker);
