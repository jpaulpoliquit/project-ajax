/**
 * Telegram → Notion ingestion
 * Fetches Telegram updates and creates Notion database pages.
 * When a page is created, Custom Agents with "page added to database" trigger will run.
 */

import type { Worker } from "@project-ajax/sdk";
import type { JSONSchemaType } from "ajv";
import type { Client } from "@notionhq/client";
import { getBotToken, telegramApi } from "../api.js";
import { extractFilesFromMessage } from "../utils.js";

const DEFAULT_DATABASE_ID = "312009f00c208036be25c17b44b2c667";

function formatDatabaseId(id: string): string {
	const clean = id.replace(/-/g, "");
	if (clean.length !== 32) return id;
	return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20, 32)}`;
}

function getTitlePropertyName(properties: Record<string, { type?: string }>): string {
	for (const [name, prop] of Object.entries(properties)) {
		if (prop?.type === "title") return name;
	}
	return "Name";
}

export function registerNotionIngestTools(worker: Worker): void {
	worker.tool<
		{
			database_id?: string;
			limit?: number;
			offset?: number;
		},
		{ created: number; pages: Array<{ page_id: string; update_id: number; title: string }>; last_offset?: number }
	>(
		"telegramIngestToNotion",
		{
			title: "Ingest Telegram Messages to Notion",
			description:
				"Fetch recent Telegram messages and create a Notion page for each in the target database. Use this when the Custom Agent runs on a schedule (e.g. every 5 min). Creating a page triggers agents with 'page added to database' trigger.",
			schema: {
				type: "object",
				properties: {
					database_id: {
						type: "string",
						nullable: true,
						description: `Notion database ID (default: ${DEFAULT_DATABASE_ID})`,
					},
					limit: { type: "number", nullable: true, description: "Max updates to process (1-100, default 50)" },
					offset: { type: "number", nullable: true, description: "Offset for getUpdates (skip already processed)" },
				},
				required: [],
				additionalProperties: false,
			} as JSONSchemaType<{ database_id?: string; limit?: number; offset?: number }>,
			execute: async (input, { notion }) => {
				const token = getBotToken();
				const dbId = formatDatabaseId(input.database_id ?? DEFAULT_DATABASE_ID);
				const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);

				// Fetch database schema to get title property name
				const db = await (notion as Client).databases.retrieve({ database_id: dbId });
				const titleProp = getTitlePropertyName(db.properties as Record<string, { type?: string }>);

				// Fetch Telegram updates
				const result = await telegramApi<
					Array<{
						update_id: number;
						message?: {
							message_id: number;
							text?: string;
							caption?: string;
							date?: number;
							chat: { id: number; title?: string; type?: string };
							document?: unknown;
							photo?: unknown;
							video?: unknown;
						};
						channel_post?: {
							message_id: number;
							text?: string;
							caption?: string;
							date?: number;
							chat: { id: number; title?: string; type?: string };
						};
						edited_message?: { message_id: number; text?: string; chat: { id: number; title?: string } };
					}>
				>(token, "getUpdates", {
					offset: input.offset,
					limit,
					allowed_updates: ["message", "channel_post", "edited_message"],
				});

				const updates = result ?? [];
				const pages: Array<{ page_id: string; update_id: number; title: string }> = [];
				let lastOffset: number | undefined;

				for (const u of updates) {
					const msg = u.message ?? u.channel_post ?? u.edited_message;
					if (!msg) continue;

					const text = msg.text ?? (msg as { caption?: string }).caption ?? "";
					const chat = msg.chat as { id: number; title?: string; type?: string };
					const chatLabel = chat.title ?? `Chat ${chat.id}`;
					const title =
						text.trim().slice(0, 100) || `[${chatLabel}] Message #${msg.message_id}`;

					const files = extractFilesFromMessage(msg as Record<string, unknown>);
					const fileSummary =
						files.length > 0
							? `\n\nAttachments: ${files.map((f) => f.type).join(", ")}`
							: "";

					const content = `From: ${chatLabel} (${chat.type ?? "chat"})
Chat ID: ${chat.id}
Message ID: ${msg.message_id}
${text}${fileSummary}`;

					const page = await (notion as Client).pages.create({
						parent: { database_id: dbId },
						properties: {
							[titleProp]: {
								title: [{ type: "text", text: { content: title } }],
							},
						},
						children: [
							{
								object: "block",
								type: "paragraph",
								paragraph: {
									rich_text: [{ type: "text", text: { content } }],
								},
							},
						],
					});

					pages.push({
						page_id: page.id,
						update_id: u.update_id,
						title,
					});
					lastOffset = u.update_id + 1;
				}

				return {
					created: pages.length,
					pages,
					...(lastOffset !== undefined && { last_offset: lastOffset }),
				};
			},
		},
	);
}
