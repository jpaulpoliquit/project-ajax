/**
 * Message tools (send, forward, copy, edit, delete)
 */

import type { Worker } from "@project-ajax/sdk";
import type { JSONSchemaType } from "ajv";
import { getBotToken, telegramApi } from "../api.js";

export function registerMessagesTools(worker: Worker): void {
	worker.tool<{ chat_id: string; text: string; parse_mode?: string; disable_notification?: boolean; reply_to_message_id?: number }, { message_id: number }>(
		"telegramSendMessage",
		{
			title: "Send Message",
			description: "Send a text message to a chat.",
			schema: {
				type: "object",
				properties: {
					chat_id: { type: "string", description: "Chat ID or @username" },
					text: { type: "string", description: "Message text (1-4096 characters)" },
					parse_mode: { type: "string", nullable: true, description: "HTML or Markdown" },
					disable_notification: { type: "boolean", nullable: true },
					reply_to_message_id: { type: "number", nullable: true },
				},
				required: ["chat_id", "text"],
				additionalProperties: false,
			} as JSONSchemaType<{ chat_id: string; text: string; parse_mode?: string; disable_notification?: boolean; reply_to_message_id?: number }>,
			execute: async (input) => {
				const token = getBotToken();
				const msg = await telegramApi<{ message_id: number }>(token, "sendMessage", {
					chat_id: input.chat_id,
					text: input.text,
					parse_mode: input.parse_mode,
					disable_notification: input.disable_notification,
					reply_to_message_id: input.reply_to_message_id,
				});
				return { message_id: msg.message_id };
			},
		},
	);

	worker.tool<{ chat_id: string; from_chat_id: string; message_id: number; disable_notification?: boolean }, { message_id: number }>(
		"telegramForwardMessage",
		{
			title: "Forward Message",
			description: "Forward a message from one chat to another.",
			schema: {
				type: "object",
				properties: {
					chat_id: { type: "string", description: "Target chat" },
					from_chat_id: { type: "string", description: "Source chat" },
					message_id: { type: "number" },
					disable_notification: { type: "boolean", nullable: true },
				},
				required: ["chat_id", "from_chat_id", "message_id"],
				additionalProperties: false,
			} as JSONSchemaType<{ chat_id: string; from_chat_id: string; message_id: number; disable_notification?: boolean }>,
			execute: async (input) => {
				const token = getBotToken();
				const msg = await telegramApi<{ message_id: number }>(token, "forwardMessage", {
					chat_id: input.chat_id,
					from_chat_id: input.from_chat_id,
					message_id: input.message_id,
					disable_notification: input.disable_notification,
				});
				return { message_id: msg.message_id };
			},
		},
	);

	worker.tool<{ chat_id: string; from_chat_id: string; message_id: number; caption?: string; parse_mode?: string }, { message_id: number }>(
		"telegramCopyMessage",
		{
			title: "Copy Message",
			description: "Copy a message to another chat (without forwarding link).",
			schema: {
				type: "object",
				properties: {
					chat_id: { type: "string" },
					from_chat_id: { type: "string" },
					message_id: { type: "number" },
					caption: { type: "string", nullable: true },
					parse_mode: { type: "string", nullable: true },
				},
				required: ["chat_id", "from_chat_id", "message_id"],
				additionalProperties: false,
			} as JSONSchemaType<{ chat_id: string; from_chat_id: string; message_id: number; caption?: string; parse_mode?: string }>,
			execute: async (input) => {
				const token = getBotToken();
				const msg = await telegramApi<{ message_id: number }>(token, "copyMessage", {
					chat_id: input.chat_id,
					from_chat_id: input.from_chat_id,
					message_id: input.message_id,
					caption: input.caption,
					parse_mode: input.parse_mode,
				});
				return { message_id: msg.message_id };
			},
		},
	);

	worker.tool<{ chat_id: string; message_id: number; text: string; parse_mode?: string }, { ok: boolean }>(
		"telegramEditMessageText",
		{
			title: "Edit Message Text",
			description: "Edit a bot's text message.",
			schema: {
				type: "object",
				properties: {
					chat_id: { type: "string" },
					message_id: { type: "number" },
					text: { type: "string" },
					parse_mode: { type: "string", nullable: true },
				},
				required: ["chat_id", "message_id", "text"],
				additionalProperties: false,
			} as JSONSchemaType<{ chat_id: string; message_id: number; text: string; parse_mode?: string }>,
			execute: async (input) => {
				const token = getBotToken();
				await telegramApi<unknown>(token, "editMessageText", {
					chat_id: input.chat_id,
					message_id: input.message_id,
					text: input.text,
					parse_mode: input.parse_mode,
				});
				return { ok: true };
			},
		},
	);

	worker.tool<{ chat_id: string; message_id: number }, { ok: boolean }>(
		"telegramDeleteMessage",
		{
			title: "Delete Message",
			description: "Delete a message. Bot must be admin in groups.",
			schema: {
				type: "object",
				properties: {
					chat_id: { type: "string" },
					message_id: { type: "number" },
				},
				required: ["chat_id", "message_id"],
				additionalProperties: false,
			} as JSONSchemaType<{ chat_id: string; message_id: number }>,
			execute: async (input) => {
				const token = getBotToken();
				await telegramApi<boolean>(token, "deleteMessage", { chat_id: input.chat_id, message_id: input.message_id });
				return { ok: true };
			},
		},
	);

	worker.tool<{ chat_id: string; action: string }, { ok: boolean }>(
		"telegramSendChatAction",
		{
			title: "Send Chat Action",
			description: "Send a chat action (typing, upload_photo, record_video, etc.) to show the bot is working.",
			schema: {
				type: "object",
				properties: {
					chat_id: { type: "string" },
					action: {
						type: "string",
						description: "typing, upload_photo, record_video, upload_video, record_voice, upload_voice, upload_document, choose_sticker, find_location, record_video_note, upload_video_note",
					},
				},
				required: ["chat_id", "action"],
				additionalProperties: false,
			} as JSONSchemaType<{ chat_id: string; action: string }>,
			execute: async (input) => {
				const token = getBotToken();
				await telegramApi<boolean>(token, "sendChatAction", { chat_id: input.chat_id, action: input.action });
				return { ok: true };
			},
		},
	);
}
