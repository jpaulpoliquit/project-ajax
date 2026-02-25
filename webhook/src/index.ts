/**
 * Telegram → Notion webhook
 * Receives Telegram updates in real time and creates Notion pages.
 * Deploy to Vercel, Cloudflare Workers, or any serverless platform.
 *
 * Env: TELEGRAM_BOT_TOKEN, NOTION_API_TOKEN, NOTION_DATABASE_ID
 */

import { Client } from "@notionhq/client";

const formatDatabaseId = (id: string): string => {
	const clean = id.replace(/-/g, "");
	if (clean.length !== 32) return id;
	return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20, 32)}`;
};

function extractFiles(msg: Record<string, unknown>): string[] {
	const types: string[] = [];
	if (msg.document) types.push("document");
	if (msg.photo) types.push("photo");
	if (msg.video) types.push("video");
	if (msg.audio) types.push("audio");
	if (msg.voice) types.push("voice");
	if (msg.video_note) types.push("video_note");
	if (msg.animation) types.push("animation");
	if (msg.sticker) types.push("sticker");
	return types;
}

function getMessage(msg: Record<string, unknown>): { text: string; chat: { id: number; title?: string; type?: string }; message_id: number } | null {
	const chat = msg.chat as { id: number; title?: string; type?: string } | undefined;
	const message_id = msg.message_id as number | undefined;
	if (!chat || message_id == null) return null;
	const text = (msg.text as string) ?? (msg.caption as string) ?? "";
	return { text, chat, message_id };
}

export async function handle(request: Request): Promise<Response> {
	if (request.method !== "POST") {
		return new Response("Not Found", { status: 404 });
	}

	const token = process.env.TELEGRAM_BOT_TOKEN;
	const notionToken = process.env.NOTION_API_TOKEN;
	const databaseId = process.env.NOTION_DATABASE_ID ?? "312009f00c208036be25c17b44b2c667";

	if (!token || !notionToken) {
		console.error("Missing TELEGRAM_BOT_TOKEN or NOTION_API_TOKEN");
		return new Response(JSON.stringify({ ok: false, error: "Server misconfigured" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return new Response("Bad Request", { status: 400 });
	}

	const update = body as { message?: Record<string, unknown>; channel_post?: Record<string, unknown>; edited_message?: Record<string, unknown> };
	const msg = update.message ?? update.channel_post ?? update.edited_message;
	if (!msg || typeof msg !== "object") {
		return new Response(JSON.stringify({ ok: true }), {
			headers: { "Content-Type": "application/json" },
		});
	}

	const parsed = getMessage(msg);
	if (!parsed) {
		return new Response(JSON.stringify({ ok: true }), {
			headers: { "Content-Type": "application/json" },
		});
	}

	const { text, chat, message_id } = parsed;
	const chatLabel = chat.title ?? `Chat ${chat.id}`;
	const title = text.trim().slice(0, 100) || `[${chatLabel}] Message #${message_id}`;
	const files = extractFiles(msg);
	const fileSummary = files.length > 0 ? `\n\nAttachments: ${files.join(", ")}` : "";
	const content = `From: ${chatLabel} (${chat.type ?? "chat"})
Chat ID: ${chat.id}
Message ID: ${message_id}
${text}${fileSummary}`;

	const notion = new Client({ auth: notionToken });
	const dbId = formatDatabaseId(databaseId);

	try {
		const db = await notion.databases.retrieve({ database_id: dbId });
		let titleProp = "Name";
		for (const [name, prop] of Object.entries(db.properties)) {
			if ((prop as { type?: string }).type === "title") {
				titleProp = name;
				break;
			}
		}

		await notion.pages.create({
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
	} catch (err) {
		console.error("Notion create failed:", err);
		return new Response(
			JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "Notion API error" }),
			{ status: 500, headers: { "Content-Type": "application/json" } },
		);
	}

	return new Response(JSON.stringify({ ok: true }), {
		headers: { "Content-Type": "application/json" },
	});
}
