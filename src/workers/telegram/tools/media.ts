/**
 * Media tools (send photo, video, document, etc.)
 */

import type { Worker } from "@project-ajax/sdk";
import type { JSONSchemaType } from "ajv";
import { getBotToken, telegramApi } from "../api.js";

export function registerMediaTools(worker: Worker): void {
	const chatIdCaptionSchema = {
		chat_id: { type: "string" as const },
		caption: { type: "string" as const, nullable: true },
		parse_mode: { type: "string" as const, nullable: true },
		disable_notification: { type: "boolean" as const, nullable: true },
		reply_to_message_id: { type: "number" as const, nullable: true },
		message_thread_id: { type: "number" as const, nullable: true, description: "Forum topic ID" },
	};

	function addThreadId<T extends Record<string, unknown>>(params: T, message_thread_id?: number): T & { message_thread_id?: number } {
		if (message_thread_id == null) return params as T & { message_thread_id?: number };
		return { ...params, message_thread_id };
	}

	worker.tool<{ chat_id: string; photo: string; caption?: string; parse_mode?: string; message_thread_id?: number }, { message_id: number }>(
		"telegramSendPhoto",
		{
			title: "Send Photo",
			description: "Send a photo. photo can be file_id or URL. Pass message_thread_id for forum topics.",
			schema: {
				type: "object",
				properties: { ...chatIdCaptionSchema, photo: { type: "string", description: "file_id or URL" } },
				required: ["chat_id", "photo"],
				additionalProperties: false,
			} as JSONSchemaType<{ chat_id: string; photo: string; caption?: string; parse_mode?: string; message_thread_id?: number }>,
			execute: async (input) => {
				const token = getBotToken();
				const msg = await telegramApi<{ message_id: number }>(token, "sendPhoto", addThreadId(input, input.message_thread_id));
				return { message_id: msg.message_id };
			},
		},
	);

	worker.tool<{ chat_id: string; document: string; caption?: string; parse_mode?: string; file_name?: string; message_thread_id?: number }, { message_id: number }>(
		"telegramSendDocument",
		{
			title: "Send Document",
			description: "Send a document. document can be file_id or URL. Pass message_thread_id for forum topics.",
			schema: {
				type: "object",
				properties: { ...chatIdCaptionSchema, document: { type: "string" }, file_name: { type: "string", nullable: true } },
				required: ["chat_id", "document"],
				additionalProperties: false,
			} as JSONSchemaType<{ chat_id: string; document: string; caption?: string; parse_mode?: string; file_name?: string; message_thread_id?: number }>,
			execute: async (input) => {
				const token = getBotToken();
				const msg = await telegramApi<{ message_id: number }>(token, "sendDocument", addThreadId(input, input.message_thread_id));
				return { message_id: msg.message_id };
			},
		},
	);

	worker.tool<{ chat_id: string; video: string; caption?: string; parse_mode?: string; duration?: number; message_thread_id?: number }, { message_id: number }>(
		"telegramSendVideo",
		{
			title: "Send Video",
			description: "Send a video. video can be file_id or URL. Pass message_thread_id for forum topics.",
			schema: {
				type: "object",
				properties: { ...chatIdCaptionSchema, video: { type: "string" }, duration: { type: "number", nullable: true } },
				required: ["chat_id", "video"],
				additionalProperties: false,
			} as JSONSchemaType<{ chat_id: string; video: string; caption?: string; parse_mode?: string; duration?: number; message_thread_id?: number }>,
			execute: async (input) => {
				const token = getBotToken();
				const msg = await telegramApi<{ message_id: number }>(token, "sendVideo", addThreadId(input, input.message_thread_id));
				return { message_id: msg.message_id };
			},
		},
	);

	worker.tool<{ chat_id: string; audio: string; caption?: string; parse_mode?: string; duration?: number; title?: string; performer?: string; message_thread_id?: number }, { message_id: number }>(
		"telegramSendAudio",
		{
			title: "Send Audio",
			description: "Send an audio file. audio can be file_id or URL. Pass message_thread_id for forum topics.",
			schema: {
				type: "object",
				properties: { ...chatIdCaptionSchema, audio: { type: "string" }, duration: { type: "number", nullable: true }, title: { type: "string", nullable: true }, performer: { type: "string", nullable: true } },
				required: ["chat_id", "audio"],
				additionalProperties: false,
			} as JSONSchemaType<{ chat_id: string; audio: string; caption?: string; parse_mode?: string; duration?: number; title?: string; performer?: string; message_thread_id?: number }>,
			execute: async (input) => {
				const token = getBotToken();
				const msg = await telegramApi<{ message_id: number }>(token, "sendAudio", addThreadId(input, input.message_thread_id));
				return { message_id: msg.message_id };
			},
		},
	);

	worker.tool<{ chat_id: string; voice: string; caption?: string; duration?: number; message_thread_id?: number }, { message_id: number }>(
		"telegramSendVoice",
		{
			title: "Send Voice",
			description: "Send a voice message. voice can be file_id or URL. Pass message_thread_id for forum topics.",
			schema: {
				type: "object",
				properties: { ...chatIdCaptionSchema, voice: { type: "string" }, duration: { type: "number", nullable: true } },
				required: ["chat_id", "voice"],
				additionalProperties: false,
			} as JSONSchemaType<{ chat_id: string; voice: string; caption?: string; duration?: number; message_thread_id?: number }>,
			execute: async (input) => {
				const token = getBotToken();
				const msg = await telegramApi<{ message_id: number }>(token, "sendVoice", addThreadId(input, input.message_thread_id));
				return { message_id: msg.message_id };
			},
		},
	);

	worker.tool<{ chat_id: string; sticker: string; message_thread_id?: number }, { message_id: number }>(
		"telegramSendSticker",
		{
			title: "Send Sticker",
			description: "Send a sticker. sticker can be file_id or URL. Pass message_thread_id for forum topics.",
			schema: {
				type: "object",
				properties: { chat_id: { type: "string" }, sticker: { type: "string" }, disable_notification: { type: "boolean", nullable: true }, reply_to_message_id: { type: "number", nullable: true }, message_thread_id: { type: "number", nullable: true } },
				required: ["chat_id", "sticker"],
				additionalProperties: false,
			} as JSONSchemaType<{ chat_id: string; sticker: string; message_thread_id?: number }>,
			execute: async (input) => {
				const token = getBotToken();
				const msg = await telegramApi<{ message_id: number }>(token, "sendSticker", addThreadId(input, input.message_thread_id));
				return { message_id: msg.message_id };
			},
		},
	);

	worker.tool<{ chat_id: string; latitude: number; longitude: number; live_period?: number; title?: string; address?: string; message_thread_id?: number }, { message_id: number }>(
		"telegramSendLocation",
		{
			title: "Send Location",
			description: "Send a location or live location. Pass message_thread_id for forum topics.",
			schema: {
				type: "object",
				properties: {
					chat_id: { type: "string" },
					latitude: { type: "number" },
					longitude: { type: "number" },
					live_period: { type: "number", nullable: true, description: "Live location period in seconds" },
					title: { type: "string", nullable: true },
					address: { type: "string", nullable: true },
					message_thread_id: { type: "number", nullable: true },
				},
				required: ["chat_id", "latitude", "longitude"],
				additionalProperties: false,
			} as JSONSchemaType<{ chat_id: string; latitude: number; longitude: number; live_period?: number; title?: string; address?: string; message_thread_id?: number }>,
			execute: async (input) => {
				const token = getBotToken();
				const msg = await telegramApi<{ message_id: number }>(token, "sendLocation", addThreadId(input, input.message_thread_id));
				return { message_id: msg.message_id };
			},
		},
	);

	worker.tool<{ chat_id: string; question: string; options: string[]; is_anonymous?: boolean; allows_multiple_answers?: boolean; message_thread_id?: number }, { message_id: number }>(
		"telegramSendPoll",
		{
			title: "Send Poll",
			description: "Send a poll. Pass message_thread_id for forum topics.",
			schema: {
				type: "object",
				properties: {
					chat_id: { type: "string" },
					question: { type: "string", description: "Poll question (1-300 chars)" },
					options: { type: "array", items: { type: "string" }, description: "2-10 options" },
					is_anonymous: { type: "boolean", nullable: true },
					allows_multiple_answers: { type: "boolean", nullable: true },
					message_thread_id: { type: "number", nullable: true },
				},
				required: ["chat_id", "question", "options"],
				additionalProperties: false,
			} as JSONSchemaType<{ chat_id: string; question: string; options: string[]; is_anonymous?: boolean; allows_multiple_answers?: boolean; message_thread_id?: number }>,
			execute: async (input) => {
				const token = getBotToken();
				const msg = await telegramApi<{ message_id: number }>(token, "sendPoll", addThreadId(input, input.message_thread_id));
				return { message_id: msg.message_id };
			},
		},
	);
}
