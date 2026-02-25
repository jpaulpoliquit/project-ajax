/**
 * Updates & Webhooks tools
 */

import type { Worker } from "@project-ajax/sdk";
import type { JSONSchemaType } from "ajv";
import { getBotToken, getHistoryBotToken, telegramApi } from "../api.js";
import { extractFilesFromMessage } from "../utils.js";

export function registerUpdatesTools(worker: Worker): void {
	type UpdateItem = {
		update_id: number;
		chat_id: string;
		chat_title?: string;
		chat_type?: string;
		message_id?: number;
		message_thread_id?: number;
		text?: string;
		caption?: string;
		date?: number;
		files: Array<{ file_id: string; file_unique_id: string; file_size?: number; file_name?: string; type: string }>;
	};

	worker.tool<{ limit?: number; offset?: number; allowed_updates?: string[] }, { updates: UpdateItem[] }>(
		"telegramGetUpdates",
		{
			title: "Get Telegram Updates",
			description: "Fetch recent updates (messages, files, channel posts). Add the bot to a group first. Returns file_id and file_unique_id for each attachment.",
			schema: {
				type: "object",
				properties: {
					limit: { type: "number", nullable: true, description: "Max updates (1-100, default 50)" },
					offset: { type: "number", nullable: true, description: "Offset for pagination" },
					allowed_updates: {
						type: "array",
						items: { type: "string" },
						nullable: true,
						description: "Update types: message, edited_message, channel_post, callback_query, etc.",
					},
				},
				required: [],
				additionalProperties: false,
			} as JSONSchemaType<{ limit?: number; offset?: number; allowed_updates?: string[] }>,
			execute: async (input) => {
				const token = getBotToken();
				const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
				const result = await telegramApi<Array<{
					update_id: number;
					message?: {
						message_id: number;
						message_thread_id?: number;
						text?: string;
						caption?: string;
						date?: number;
						chat: { id: number; title?: string; type?: string };
						document?: { file_id: string; file_unique_id: string; file_size?: number; file_name?: string };
						photo?: Array<{ file_id: string; file_unique_id: string; file_size?: number }>;
						video?: { file_id: string; file_unique_id: string; file_size?: number; file_name?: string };
						audio?: { file_id: string; file_unique_id: string; file_size?: number; file_name?: string };
						voice?: { file_id: string; file_unique_id: string; file_size?: number };
						video_note?: { file_id: string; file_unique_id: string; file_size?: number };
						animation?: { file_id: string; file_unique_id: string; file_size?: number; file_name?: string };
						sticker?: { file_id: string; file_unique_id: string; file_size?: number };
					};
					channel_post?: { message_id: number; message_thread_id?: number; text?: string; caption?: string; date?: number; chat: { id: number; title?: string; type?: string }; document?: unknown; photo?: unknown; video?: unknown };
					edited_message?: { message_id: number; message_thread_id?: number; text?: string; chat: { id: number; title?: string } };
				}>>(token, "getUpdates", {
					offset: input.offset,
					limit,
					allowed_updates: input.allowed_updates ?? ["message", "channel_post", "edited_message"],
				});

				const updates: UpdateItem[] = (result || []).map((u) => {
					const msg = u.message ?? u.channel_post ?? u.edited_message;
					if (!msg) return { update_id: u.update_id, chat_id: "", files: [] };
					const files = extractFilesFromMessage(msg as Record<string, unknown>);
					const chat = msg.chat as { id: number; title?: string; type?: string };
					const m = msg as { message_thread_id?: number };
					return {
						update_id: u.update_id,
						chat_id: String(chat.id),
						chat_title: chat.title,
						chat_type: chat.type,
						message_id: msg.message_id,
						...(m.message_thread_id != null && { message_thread_id: m.message_thread_id }),
						text: msg.text,
						caption: (msg as { caption?: string }).caption,
						date: (msg as { date?: number }).date,
						files,
					};
				});

				return { updates };
			},
		},
	);

	worker.tool<{ limit?: number; offset?: number; allowed_updates?: string[] }, { updates: UpdateItem[] }>(
		"telegramGetUpdatesFromHistoryBot",
		{
			title: "Get Telegram Updates (History Bot)",
			description:
				"Fetch recent updates using a secondary bot that has NO webhook. Use this when the main bot has webhook active (409 error on telegramGetUpdates). Requires TELEGRAM_HISTORY_BOT_TOKEN. Add the history bot to the same groups as the main bot. Returns message_thread_id for forum topics.",
			schema: {
				type: "object",
				properties: {
					limit: { type: "number", nullable: true, description: "Max updates (1-100, default 50)" },
					offset: { type: "number", nullable: true, description: "Offset for pagination" },
					allowed_updates: {
						type: "array",
						items: { type: "string" },
						nullable: true,
						description: "Update types: message, edited_message, channel_post, etc.",
					},
				},
				required: [],
				additionalProperties: false,
			} as JSONSchemaType<{ limit?: number; offset?: number; allowed_updates?: string[] }>,
			execute: async (input) => {
				const token = getHistoryBotToken();
				const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
				const result = await telegramApi<Array<{
					update_id: number;
					message?: {
						message_id: number;
						message_thread_id?: number;
						text?: string;
						caption?: string;
						date?: number;
						chat: { id: number; title?: string; type?: string };
						document?: { file_id: string; file_unique_id: string; file_size?: number; file_name?: string };
						photo?: Array<{ file_id: string; file_unique_id: string; file_size?: number }>;
						video?: { file_id: string; file_unique_id: string; file_size?: number; file_name?: string };
						audio?: { file_id: string; file_unique_id: string; file_size?: number; file_name?: string };
						voice?: { file_id: string; file_unique_id: string; file_size?: number };
						video_note?: { file_id: string; file_unique_id: string; file_size?: number };
						animation?: { file_id: string; file_unique_id: string; file_size?: number; file_name?: string };
						sticker?: { file_id: string; file_unique_id: string; file_size?: number };
					};
					channel_post?: { message_id: number; message_thread_id?: number; text?: string; caption?: string; date?: number; chat: { id: number; title?: string; type?: string }; document?: unknown; photo?: unknown; video?: unknown };
					edited_message?: { message_id: number; message_thread_id?: number; text?: string; chat: { id: number; title?: string } };
				}>>(token, "getUpdates", {
					offset: input.offset,
					limit,
					allowed_updates: input.allowed_updates ?? ["message", "channel_post", "edited_message"],
				});

				const updates: UpdateItem[] = (result || []).map((u) => {
					const msg = u.message ?? u.channel_post ?? u.edited_message;
					if (!msg) return { update_id: u.update_id, chat_id: "", files: [] };
					const files = extractFilesFromMessage(msg as Record<string, unknown>);
					const chat = msg.chat as { id: number; title?: string; type?: string };
					const m = msg as { message_thread_id?: number };
					return {
						update_id: u.update_id,
						chat_id: String(chat.id),
						chat_title: chat.title,
						chat_type: chat.type,
						message_id: msg.message_id,
						...(m.message_thread_id != null && { message_thread_id: m.message_thread_id }),
						text: msg.text,
						caption: (msg as { caption?: string }).caption,
						date: (msg as { date?: number }).date,
						files,
					};
				});

				return { updates };
			},
		},
	);

	worker.tool<Record<string, never>, { url: string; pending_update_count?: number; last_error_message?: string }>(
		"telegramGetWebhookInfo",
		{
			title: "Get Webhook Info",
			description: "Get current webhook status. Returns URL if set, pending update count, and last error.",
			schema: { type: "object", properties: {}, required: [], additionalProperties: false } as JSONSchemaType<Record<string, never>>,
			execute: async () => {
				const token = getBotToken();
				const info = await telegramApi<{ url: string; pending_update_count?: number; last_error_message?: string }>(token, "getWebhookInfo");
				return {
					url: info.url || "",
					pending_update_count: info.pending_update_count,
					last_error_message: info.last_error_message,
				};
			},
		},
	);

	worker.tool<{ url: string; drop_pending_updates?: boolean }, { ok: boolean }>(
		"telegramSetWebhook",
		{
			title: "Set Webhook",
			description: "Set webhook URL to receive updates via HTTPS POST. Use empty string to remove.",
			schema: {
				type: "object",
				properties: {
					url: { type: "string", description: "HTTPS URL for webhook, or empty to remove" },
					drop_pending_updates: { type: "boolean", nullable: true, description: "Drop pending updates" },
				},
				required: ["url"],
				additionalProperties: false,
			} as JSONSchemaType<{ url: string; drop_pending_updates?: boolean }>,
			execute: async (input) => {
				const token = getBotToken();
				await telegramApi<boolean>(token, "setWebhook", {
					url: input.url,
					drop_pending_updates: input.drop_pending_updates,
				});
				return { ok: true };
			},
		},
	);

	worker.tool<{ drop_pending_updates?: boolean }, { ok: boolean }>(
		"telegramDeleteWebhook",
		{
			title: "Delete Webhook",
			description: "Remove webhook and switch back to getUpdates.",
			schema: {
				type: "object",
				properties: { drop_pending_updates: { type: "boolean", nullable: true } },
				required: [],
				additionalProperties: false,
			} as JSONSchemaType<{ drop_pending_updates?: boolean }>,
			execute: async (input) => {
				const token = getBotToken();
				await telegramApi<boolean>(token, "deleteWebhook", { drop_pending_updates: input.drop_pending_updates });
				return { ok: true };
			},
		},
	);
}
