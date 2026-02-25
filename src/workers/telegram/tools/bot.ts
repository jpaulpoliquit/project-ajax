/**
 * Bot info and settings tools
 */

import type { Worker } from "@project-ajax/sdk";
import type { JSONSchemaType } from "ajv";
import { getBotToken, telegramApi } from "../api.js";

export function registerBotTools(worker: Worker): void {
	worker.tool<Record<string, never>, { id: number; is_bot: boolean; first_name: string; username?: string; can_join_groups?: boolean; can_read_all_group_messages?: boolean }>(
		"telegramGetMe",
		{
			title: "Get Bot Info",
			description: "Get information about the bot.",
			schema: { type: "object", properties: {}, required: [], additionalProperties: false } as JSONSchemaType<Record<string, never>>,
			execute: async () => {
				const token = getBotToken();
				const me = await telegramApi<{ id: number; is_bot: boolean; first_name: string; username?: string; can_join_groups?: boolean; can_read_all_group_messages?: boolean }>(token, "getMe");
				return me;
			},
		},
	);

	worker.tool<{ commands: Array<{ command: string; description: string }>; scope?: string; language_code?: string }, { ok: boolean }>(
		"telegramSetMyCommands",
		{
			title: "Set Bot Commands",
			description: "Set the list of bot commands (shown in menu).",
			schema: {
				type: "object",
				properties: {
					commands: {
						type: "array",
						items: {
							type: "object",
							properties: { command: { type: "string" }, description: { type: "string" } },
							required: ["command", "description"],
							additionalProperties: false,
						},
					},
					scope: { type: "string", nullable: true, description: "default, all_private_chats, all_group_chats, all_chat_administrators" },
					language_code: { type: "string", nullable: true },
				},
				required: ["commands"],
				additionalProperties: false,
			} as JSONSchemaType<{ commands: Array<{ command: string; description: string }>; scope?: string; language_code?: string }>,
			execute: async (input) => {
				const token = getBotToken();
				await telegramApi<boolean>(token, "setMyCommands", {
					commands: input.commands,
					scope: input.scope ? { type: input.scope } : undefined,
					language_code: input.language_code,
				});
				return { ok: true };
			},
		},
	);

	worker.tool<{ scope?: string; language_code?: string }, { commands: Array<{ command: string; description: string }> }>(
		"telegramGetMyCommands",
		{
			title: "Get Bot Commands",
			description: "Get the list of bot commands.",
			schema: {
				type: "object",
				properties: {
					scope: { type: "string", nullable: true },
					language_code: { type: "string", nullable: true },
				},
				required: [],
				additionalProperties: false,
			} as JSONSchemaType<{ scope?: string; language_code?: string }>,
			execute: async (input) => {
				const token = getBotToken();
				const commands = await telegramApi<Array<{ command: string; description: string }>>(token, "getMyCommands", {
					scope: input.scope ? { type: input.scope } : undefined,
					language_code: input.language_code,
				});
				return { commands: commands || [] };
			},
		},
	);

	worker.tool<{ description?: string; short_description?: string }, { ok: boolean }>(
		"telegramSetMyDescription",
		{
			title: "Set Bot Description",
			description: "Set bot description (shown in chat with bot).",
			schema: {
				type: "object",
				properties: {
					description: { type: "string", nullable: true },
					short_description: { type: "string", nullable: true },
				},
				required: [],
				additionalProperties: false,
			} as JSONSchemaType<{ description?: string; short_description?: string }>,
			execute: async (input) => {
				const token = getBotToken();
				if (input.description !== undefined) {
					await telegramApi<boolean>(token, "setMyDescription", { description: input.description });
				}
				if (input.short_description !== undefined) {
					await telegramApi<boolean>(token, "setMyShortDescription", { short_description: input.short_description });
				}
				return { ok: true };
			},
		},
	);
}
