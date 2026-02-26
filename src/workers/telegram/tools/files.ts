/**
 * File tools
 */

import type { Worker } from "@project-ajax/sdk";
import type { JSONSchemaType } from "ajv";
import { getBotToken, telegramApi, getFileDownloadUrl } from "../api.js";
import { extractFilesFromMessage } from "../utils.js";

export function registerFilesTools(worker: Worker): void {
	worker.tool<{ file_id: string }, { file_id: string; file_unique_id: string; file_size?: number; file_path?: string; download_url: string }>(
		"telegramGetFile",
		{
			title: "Get Telegram File",
			description: "Get file metadata and download URL by file_id. Files identified by file_id (session) and file_unique_id (persistent).",
			schema: {
				type: "object",
				properties: { file_id: { type: "string", description: "file_id from a message" } },
				required: ["file_id"],
				additionalProperties: false,
			} as JSONSchemaType<{ file_id: string }>,
			execute: async (input) => {
				const token = getBotToken();
				const file = await telegramApi<{ file_id: string; file_unique_id: string; file_size?: number; file_path?: string }>(token, "getFile", { file_id: input.file_id });
				const downloadUrl = file.file_path ? getFileDownloadUrl(token, file.file_path) : "";
				return { ...file, download_url: downloadUrl };
			},
		},
	);

	worker.tool<{ chat_id: string; limit?: number }, { files: Array<{ file_id: string; file_unique_id: string; file_size?: number; file_name?: string; mime_type?: string; type: string; message_id: number }> }>(
		"telegramListChatFiles",
		{
			title: "List Chat Files",
			description: "List files shared in a chat. Provide chat_id from telegramGetUpdates.",
			schema: {
				type: "object",
				properties: {
					chat_id: { type: "string", description: "Chat ID (e.g. -1001234567890 for groups)" },
					limit: { type: "number", nullable: true, description: "Max messages to scan (default 100)" },
				},
				required: ["chat_id"],
				additionalProperties: false,
			} as JSONSchemaType<{ chat_id: string; limit?: number }>,
			execute: async (input) => {
				const token = getBotToken();
				const limit = Math.min(input.limit ?? 100, 100);
				const result = await telegramApi<Array<{ message?: { message_id: number; chat: { id: number }; document?: unknown; photo?: unknown; video?: unknown; audio?: unknown; voice?: unknown; video_note?: unknown; animation?: unknown; sticker?: unknown } }>>(
					token,
					"getUpdates",
					{ limit, allowed_updates: ["message", "channel_post"] },
				);
				const chatId = input.chat_id;
				const files: Array<{ file_id: string; file_unique_id: string; file_size?: number; file_name?: string; mime_type?: string; type: string; message_id: number }> = [];
				for (const u of result || []) {
					const msg = u.message;
					if (!msg || String(msg.chat.id) !== chatId) continue;
					for (const f of extractFilesFromMessage(msg as Record<string, unknown>)) {
						files.push({ ...f, message_id: msg.message_id });
					}
				}
				return { files };
			},
		},
	);
}
