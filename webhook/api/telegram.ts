/**
 * Vercel serverless function: receives Telegram webhook, creates Notion pages.
 * Set webhook: npx workers exec telegramSetWebhook -d '{"url":"https://notionworkers.vercel.app/api/telegram"}'
 *
 * Env: NOTION_API_TOKEN, TELEGRAM_BOT_TOKEN (for confirmation reply), NOTION_DATABASE_ID
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VercelRequest = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VercelResponse = any;
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

export const config = { api: { bodyParser: true } };

async function sendTelegramReply(chatId: number, text: string): Promise<void> {
	const token = process.env.TELEGRAM_BOT_TOKEN;
	if (!token) return;
	await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ chat_id: chatId, text }),
	});
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
	if (req.method !== "POST") {
		return res.status(404).send("Not Found");
	}

	const notionToken = process.env.NOTION_API_TOKEN;
	const databaseId = process.env.NOTION_DATABASE_ID ?? "312009f00c208036be25c17b44b2c667";

	if (!notionToken) {
		console.error("Missing NOTION_API_TOKEN");
		return res.status(500).json({ ok: false, error: "Server misconfigured" });
	}

	// Handle both parsed body and raw string (Telegram sends JSON)
	let body: Record<string, unknown>;
	if (typeof req.body === "string") {
		try {
			body = JSON.parse(req.body) as Record<string, unknown>;
		} catch {
			return res.status(400).json({ ok: false, error: "Invalid JSON" });
		}
	} else {
		body = (req.body as Record<string, unknown>) ?? {};
	}
	const update = body;
	const msg = (update.message ?? update.channel_post ?? update.edited_message) as Record<string, unknown> | undefined;

	if (!msg || typeof msg !== "object") {
		return res.json({ ok: true });
	}

	const parsed = getMessage(msg);
	if (!parsed) {
		return res.json({ ok: true });
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

		// Send immediate confirmation so user knows it worked
		await sendTelegramReply(chat.id, "✓ Received — creating entry in Notion. The agent will process it shortly.");
	} catch (err) {
		console.error("Notion create failed:", err);
		return res.status(500).json({
			ok: false,
			error: err instanceof Error ? err.message : "Notion API error",
		});
	}

	return res.json({ ok: true });
}
