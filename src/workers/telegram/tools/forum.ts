/**
 * Forum topic tools
 */

import type { Worker } from "@project-ajax/sdk";
import type { JSONSchemaType } from "ajv";
import { getBotToken, telegramApi } from "../api.js";

export function registerForumTools(worker: Worker): void {
	worker.tool<{ chat_id: string; name: string; icon_color?: number; icon_custom_emoji_id?: string }, { message_thread_id: number }>(
		"telegramCreateForumTopic",
		{
			title: "Create Forum Topic",
			description: "Create a forum topic in a supergroup.",
			schema: {
				type: "object",
				properties: {
					chat_id: { type: "string" },
					name: { type: "string", description: "Topic name (1-128 chars)" },
					icon_color: { type: "number", nullable: true },
					icon_custom_emoji_id: { type: "string", nullable: true },
				},
				required: ["chat_id", "name"],
				additionalProperties: false,
			} as JSONSchemaType<{ chat_id: string; name: string; icon_color?: number; icon_custom_emoji_id?: string }>,
			execute: async (input) => {
				const token = getBotToken();
				const result = await telegramApi<{ message_thread_id: number }>(token, "createForumTopic", input);
				return result;
			},
		},
	);

	worker.tool<{ chat_id: string; message_thread_id: number; name?: string; icon_custom_emoji_id?: string }, { ok: boolean }>(
		"telegramEditForumTopic",
		{
			title: "Edit Forum Topic",
			description: "Edit name or icon of a forum topic.",
			schema: {
				type: "object",
				properties: {
					chat_id: { type: "string" },
					message_thread_id: { type: "number" },
					name: { type: "string", nullable: true },
					icon_custom_emoji_id: { type: "string", nullable: true },
				},
				required: ["chat_id", "message_thread_id"],
				additionalProperties: false,
			} as JSONSchemaType<{ chat_id: string; message_thread_id: number; name?: string; icon_custom_emoji_id?: string }>,
			execute: async (input) => {
				const token = getBotToken();
				await telegramApi<boolean>(token, "editForumTopic", input);
				return { ok: true };
			},
		},
	);

	worker.tool<{ chat_id: string; message_thread_id: number }, { ok: boolean }>(
		"telegramCloseForumTopic",
		{
			title: "Close Forum Topic",
			description: "Close a forum topic.",
			schema: {
				type: "object",
				properties: {
					chat_id: { type: "string" },
					message_thread_id: { type: "number" },
				},
				required: ["chat_id", "message_thread_id"],
				additionalProperties: false,
			} as JSONSchemaType<{ chat_id: string; message_thread_id: number }>,
			execute: async (input) => {
				const token = getBotToken();
				await telegramApi<boolean>(token, "closeForumTopic", input);
				return { ok: true };
			},
		},
	);

	worker.tool<{ chat_id: string; message_thread_id: number }, { ok: boolean }>(
		"telegramDeleteForumTopic",
		{
			title: "Delete Forum Topic",
			description: "Delete a forum topic.",
			schema: {
				type: "object",
				properties: {
					chat_id: { type: "string" },
					message_thread_id: { type: "number" },
				},
				required: ["chat_id", "message_thread_id"],
				additionalProperties: false,
			} as JSONSchemaType<{ chat_id: string; message_thread_id: number }>,
			execute: async (input) => {
				const token = getBotToken();
				await telegramApi<boolean>(token, "deleteForumTopic", input);
				return { ok: true };
			},
		},
	);
}
