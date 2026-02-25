/**
 * Chat management tools
 */

import type { Worker } from "@project-ajax/sdk";
import type { JSONSchemaType } from "ajv";
import { getBotToken, telegramApi } from "../api.js";

export function registerChatTools(worker: Worker): void {
	worker.tool<{ chat_id: string }, { id: number; type: string; title?: string; username?: string; description?: string }>(
		"telegramGetChat",
		{
			title: "Get Chat",
			description: "Get information about a chat.",
			schema: {
				type: "object",
				properties: { chat_id: { type: "string", description: "Chat ID or @username" } },
				required: ["chat_id"],
				additionalProperties: false,
			} as JSONSchemaType<{ chat_id: string }>,
			execute: async (input) => {
				const token = getBotToken();
				const chat = await telegramApi<{ id: number; type: string; title?: string; username?: string; description?: string }>(token, "getChat", { chat_id: input.chat_id });
				return chat;
			},
		},
	);

	worker.tool<{ chat_id: string }, { count: number }>(
		"telegramGetChatMemberCount",
		{
			title: "Get Chat Member Count",
			description: "Get the number of members in a chat.",
			schema: {
				type: "object",
				properties: { chat_id: { type: "string" } },
				required: ["chat_id"],
				additionalProperties: false,
			} as JSONSchemaType<{ chat_id: string }>,
			execute: async (input) => {
				const token = getBotToken();
				const count = await telegramApi<number>(token, "getChatMemberCount", { chat_id: input.chat_id });
				return { count };
			},
		},
	);

	worker.tool<{ chat_id: string; user_id: string }, { status: string; user?: { id: number; username?: string; first_name?: string } }>(
		"telegramGetChatMember",
		{
			title: "Get Chat Member",
			description: "Get information about a chat member.",
			schema: {
				type: "object",
				properties: {
					chat_id: { type: "string" },
					user_id: { type: "string", description: "User ID" },
				},
				required: ["chat_id", "user_id"],
				additionalProperties: false,
			} as JSONSchemaType<{ chat_id: string; user_id: string }>,
			execute: async (input) => {
				const token = getBotToken();
				const member = await telegramApi<{ status: string; user?: { id: number; username?: string; first_name?: string } }>(token, "getChatMember", {
					chat_id: input.chat_id,
					user_id: input.user_id,
				});
				return member;
			},
		},
	);

	worker.tool<{ chat_id: string }, { administrators: Array<{ user: { id: number; username?: string; first_name?: string }; status: string; custom_title?: string }> }>(
		"telegramGetChatAdministrators",
		{
			title: "Get Chat Administrators",
			description: "Get a list of administrators in a chat.",
			schema: {
				type: "object",
				properties: { chat_id: { type: "string" } },
				required: ["chat_id"],
				additionalProperties: false,
			} as JSONSchemaType<{ chat_id: string }>,
			execute: async (input) => {
				const token = getBotToken();
				const admins = await telegramApi<Array<{ user: { id: number; username?: string; first_name?: string }; status: string; custom_title?: string }>>(token, "getChatAdministrators", { chat_id: input.chat_id });
				return { administrators: admins };
			},
		},
	);

	worker.tool<{ chat_id: string }, { ok: boolean }>(
		"telegramLeaveChat",
		{
			title: "Leave Chat",
			description: "Leave a group, supergroup or channel.",
			schema: {
				type: "object",
				properties: { chat_id: { type: "string" } },
				required: ["chat_id"],
				additionalProperties: false,
			} as JSONSchemaType<{ chat_id: string }>,
			execute: async (input) => {
				const token = getBotToken();
				await telegramApi<boolean>(token, "leaveChat", { chat_id: input.chat_id });
				return { ok: true };
			},
		},
	);

	worker.tool<{ chat_id: string; message_id: number; disable_notification?: boolean }, { ok: boolean }>(
		"telegramPinChatMessage",
		{
			title: "Pin Chat Message",
			description: "Pin a message in a chat.",
			schema: {
				type: "object",
				properties: {
					chat_id: { type: "string" },
					message_id: { type: "number" },
					disable_notification: { type: "boolean", nullable: true },
				},
				required: ["chat_id", "message_id"],
				additionalProperties: false,
			} as JSONSchemaType<{ chat_id: string; message_id: number; disable_notification?: boolean }>,
			execute: async (input) => {
				const token = getBotToken();
				await telegramApi<boolean>(token, "pinChatMessage", {
					chat_id: input.chat_id,
					message_id: input.message_id,
					disable_notification: input.disable_notification,
				});
				return { ok: true };
			},
		},
	);

	worker.tool<{ chat_id: string; message_id?: number }, { ok: boolean }>(
		"telegramUnpinChatMessage",
		{
			title: "Unpin Chat Message",
			description: "Unpin a message. Omit message_id to unpin all.",
			schema: {
				type: "object",
				properties: {
					chat_id: { type: "string" },
					message_id: { type: "number", nullable: true },
				},
				required: ["chat_id"],
				additionalProperties: false,
			} as JSONSchemaType<{ chat_id: string; message_id?: number }>,
			execute: async (input) => {
				const token = getBotToken();
				if (input.message_id) {
					await telegramApi<boolean>(token, "unpinChatMessage", { chat_id: input.chat_id, message_id: input.message_id });
				} else {
					await telegramApi<boolean>(token, "unpinAllChatMessages", { chat_id: input.chat_id });
				}
				return { ok: true };
			},
		},
	);

	worker.tool<{ chat_id: string }, { invite_link?: string }>(
		"telegramExportChatInviteLink",
		{
			title: "Export Chat Invite Link",
			description: "Generate a new primary invite link for a chat.",
			schema: {
				type: "object",
				properties: { chat_id: { type: "string" } },
				required: ["chat_id"],
				additionalProperties: false,
			} as JSONSchemaType<{ chat_id: string }>,
			execute: async (input) => {
				const token = getBotToken();
				const link = await telegramApi<string>(token, "exportChatInviteLink", { chat_id: input.chat_id });
				return { invite_link: link };
			},
		},
	);

	worker.tool<{ chat_id: string; user_id: string }, { ok: boolean }>(
		"telegramApproveChatJoinRequest",
		{
			title: "Approve Chat Join Request",
			description: "Approve a chat join request.",
			schema: {
				type: "object",
				properties: {
					chat_id: { type: "string" },
					user_id: { type: "string" },
				},
				required: ["chat_id", "user_id"],
				additionalProperties: false,
			} as JSONSchemaType<{ chat_id: string; user_id: string }>,
			execute: async (input) => {
				const token = getBotToken();
				await telegramApi<boolean>(token, "approveChatJoinRequest", { chat_id: input.chat_id, user_id: input.user_id });
				return { ok: true };
			},
		},
	);

	worker.tool<{ chat_id: string; user_id: string }, { ok: boolean }>(
		"telegramDeclineChatJoinRequest",
		{
			title: "Decline Chat Join Request",
			description: "Decline a chat join request.",
			schema: {
				type: "object",
				properties: {
					chat_id: { type: "string" },
					user_id: { type: "string" },
				},
				required: ["chat_id", "user_id"],
				additionalProperties: false,
			} as JSONSchemaType<{ chat_id: string; user_id: string }>,
			execute: async (input) => {
				const token = getBotToken();
				await telegramApi<boolean>(token, "declineChatJoinRequest", { chat_id: input.chat_id, user_id: input.user_id });
				return { ok: true };
			},
		},
	);
}
