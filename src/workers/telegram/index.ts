/**
 * Telegram Worker
 * Exhaustive Telegram Bot API integration. Add the bot to a group to access messages and files.
 */

import type { Worker } from "@project-ajax/sdk";
import {
	registerUpdatesTools,
	registerFilesTools,
	registerChatTools,
	registerMessagesTools,
	registerMediaTools,
	registerBotTools,
	registerForumTools,
	registerNotionIngestTools,
} from "./tools/index.js";

export function registerTelegramTools(worker: Worker): void {
	registerUpdatesTools(worker);
	registerFilesTools(worker);
	registerChatTools(worker);
	registerMessagesTools(worker);
	registerMediaTools(worker);
	registerBotTools(worker);
	registerForumTools(worker);
	registerNotionIngestTools(worker);
}
