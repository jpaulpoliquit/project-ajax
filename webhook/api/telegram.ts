/**
 * Vercel serverless function: receives Telegram webhook, creates Notion pages.
 * Set webhook: npx workers exec telegramSetWebhook -d '{"url":"https://notionworkers.vercel.app/api/telegram"}'
 *
 * Env: NOTION_API_TOKEN, TELEGRAM_BOT_TOKEN (for 👀 reaction ack), NOTION_DATABASE_ID
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VercelRequest = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VercelResponse = any;
import { Client } from "@notionhq/client";

// Inlined from shared/notion-schema (avoids ESM resolution issues on Vercel)
type NotionDatabaseProperty = {
	type?: string;
	status?: { options?: { name: string }[] };
};
type NotionPropertyMap = Record<string, NotionDatabaseProperty>;
type TelegramNotionSchema = {
	titleProp: string;
	chatIdProp: string | null;
	topicIdProp: string | null;
	messageIdProp: string | null;
	updateIdProp: string | null;
	statusProp: string | null;
	statusNotStarted: string | null;
};

function normalizeName(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function findPropertyName(
	properties: NotionPropertyMap | null | undefined,
	type: string,
	candidates: string[],
): string | null {
	const wanted = new Set(candidates.map(normalizeName));
	if (properties == null || typeof properties !== "object" || Array.isArray(properties)) return null;
	try {
		for (const [name, prop] of Object.entries(properties)) {
			if (prop?.type !== type) continue;
			if (wanted.has(normalizeName(name))) return name;
		}
	} catch {
		return null;
	}
	return null;
}
function resolveTelegramNotionSchema(properties: NotionPropertyMap | null | undefined): TelegramNotionSchema | null {
	if (properties == null || typeof properties !== "object" || Array.isArray(properties)) return null;
	let titleProp = "Name";
	let statusProp: string | null = null;
	let statusNotStarted: string | null = null;
	try {
		for (const [name, prop] of Object.entries(properties)) {
			const t = prop?.type;
			if (t === "title") titleProp = name;
			else if (t === "status") {
				statusProp = name;
				const options = prop?.status?.options;
				statusNotStarted = options?.find((o) => /not\s*started/i.test(o.name))?.name ?? options?.[0]?.name ?? null;
			}
		}
	} catch {
		return null;
	}
	return {
		titleProp,
		chatIdProp: findPropertyName(properties, "number", ["Chat ID", "Telegram Chat ID"]),
		topicIdProp: findPropertyName(properties, "number", ["Topic ID", "Telegram Topic ID", "Thread ID", "Message Thread ID"]),
		messageIdProp: findPropertyName(properties, "number", ["Message ID", "Telegram Message ID"]),
		updateIdProp: findPropertyName(properties, "number", ["Update ID", "Telegram Update ID"]),
		statusProp,
		statusNotStarted,
	};
}
function logNotionFailure(event: string, error: unknown, context: Record<string, unknown>): void {
	const code = (error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string")
		? (error as { code: string }).code
		: null;
	const message = error instanceof Error ? error.message : String(error);
	console.error(event, {
		failure_class: (() => {
			switch (code) {
				case "object_not_found": return "object_not_found";
				case "unauthorized":
				case "restricted_resource": return "unauthorized";
				case "rate_limited": return "rate_limited";
				case "validation_error": return "validation_error";
				case "conflict_error": return "conflict_error";
				case "request_timeout": return "request_timeout";
			}
			if (error instanceof Error && /no properties/i.test(error.message)) return "schema_unavailable";
			return code ? "api_response_error" : "unknown";
		})(),
		notion_error_code: code,
		message,
		...context,
	});
}

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_API_VERSION = process.env.NOTION_API_VERSION ?? "2025-09-03";

/** Fetch schema properties. In 2025-09-03, properties live on data sources, not databases. */
async function getNotionSchemaProperties(
	notionToken: string,
	dbId: string,
): Promise<NotionPropertyMap | null> {
	const db = await fetch(`${NOTION_API_BASE}/databases/${dbId}`, {
		headers: {
			Authorization: `Bearer ${notionToken}`,
			"Notion-Version": NOTION_API_VERSION,
		},
	}).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`databases.retrieve failed: ${r.status}`))));

	const dataSources = db.data_sources as Array<{ id: string; name?: string }> | undefined;
	if (Array.isArray(dataSources) && dataSources.length > 0) {
		const dsId = dataSources[0].id;
		const ds = await fetch(`${NOTION_API_BASE}/data_sources/${dsId}`, {
			headers: {
				Authorization: `Bearer ${notionToken}`,
				"Notion-Version": NOTION_API_VERSION,
			},
		}).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`data_sources.retrieve failed: ${r.status}`))));
		return (ds.properties as NotionPropertyMap) ?? null;
	}
	return (db.properties as NotionPropertyMap) ?? null;
}
const NOTION_SINGLE_PART_UPLOAD_BYTES = 20 * 1024 * 1024;
const DEFAULT_TELEGRAM_NOTION_MAX_FILE_BYTES = 100 * 1024 * 1024;
const NOTION_BLOCK_APPEND_BATCH_SIZE = 100;
const TELEGRAM_SECRET_HEADER = "x-telegram-bot-api-secret-token";

type FileInfo = {
	file_id: string;
	file_unique_id: string;
	file_size?: number;
	file_name?: string;
	mime_type?: string;
	type: string;
};

type NotionAttachmentBlockType = "image" | "video" | "audio" | "pdf" | "file";

type AttachmentUploadState = {
	file_id: string;
	file_unique_id: string;
	type: string;
	file_name: string;
	mime_type: string;
	size_bytes: number;
	status: "uploaded" | "skipped" | "failed";
	notion_file_upload_id?: string;
	notion_block_type?: NotionAttachmentBlockType;
	reason?: string;
};

const EXTENSION_TO_MIME: Record<string, string> = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	webp: "image/webp",
	gif: "image/gif",
	bmp: "image/bmp",
	svg: "image/svg+xml",
	mp4: "video/mp4",
	mov: "video/quicktime",
	webm: "video/webm",
	mkv: "video/x-matroska",
	m4v: "video/x-m4v",
	mp3: "audio/mpeg",
	m4a: "audio/mp4",
	ogg: "audio/ogg",
	oga: "audio/ogg",
	opus: "audio/ogg",
	wav: "audio/wav",
	flac: "audio/flac",
	pdf: "application/pdf",
	txt: "text/plain",
	json: "application/json",
	csv: "text/csv",
	zip: "application/zip",
};

const MIME_TO_EXTENSION: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"image/gif": "gif",
	"video/mp4": "mp4",
	"video/quicktime": "mov",
	"video/webm": "webm",
	"video/x-matroska": "mkv",
	"audio/mpeg": "mp3",
	"audio/mp4": "m4a",
	"audio/ogg": "ogg",
	"audio/wav": "wav",
	"audio/flac": "flac",
	"application/pdf": "pdf",
	"text/plain": "txt",
	"application/json": "json",
	"text/csv": "csv",
};

const formatDatabaseId = (id: string): string => {
	const clean = id.replace(/-/g, "");
	if (clean.length !== 32) return id;
	return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20, 32)}`;
};

function getMaxUploadBytes(): number {
	const configured = Number(process.env.TELEGRAM_NOTION_MAX_FILE_BYTES);
	if (Number.isFinite(configured) && configured > 0) return Math.floor(configured);
	return DEFAULT_TELEGRAM_NOTION_MAX_FILE_BYTES;
}

function sanitizeFilename(filename: string): string {
	const cleaned = filename
		.trim()
		.replace(/[^\w.\-]+/g, "_")
		.replace(/_{2,}/g, "_");
	const fallback = cleaned || "telegram_file";
	return fallback.length > 180 ? fallback.slice(0, 180) : fallback;
}

function extensionFromName(name?: string): string | undefined {
	if (!name) return undefined;
	const match = /\.([a-z0-9]{1,10})$/i.exec(name);
	return match ? match[1].toLowerCase() : undefined;
}

function mimeFromExtension(ext?: string): string | undefined {
	if (!ext) return undefined;
	return EXTENSION_TO_MIME[ext.toLowerCase()];
}

function extensionFromMime(mime?: string): string | undefined {
	if (!mime) return undefined;
	return MIME_TO_EXTENSION[mime.toLowerCase()];
}

function inferMimeType(file: FileInfo, responseMimeType: string | null, filePath?: string): string {
	const responseMime = responseMimeType?.split(";")[0]?.trim().toLowerCase();
	if (file.mime_type) return file.mime_type;
	if (responseMime) return responseMime;
	const fromName = mimeFromExtension(extensionFromName(file.file_name));
	if (fromName) return fromName;
	const fromPath = mimeFromExtension(extensionFromName(filePath));
	if (fromPath) return fromPath;
	if (file.type === "photo") return "image/jpeg";
	if (file.type === "video" || file.type === "video_note" || file.type === "animation") return "video/mp4";
	if (file.type === "audio" || file.type === "voice") return "audio/ogg";
	if (file.type === "sticker") return "image/webp";
	return "application/octet-stream";
}

function inferFilename(file: FileInfo, filePath: string | undefined, mimeType: string): string {
	if (file.file_name) return sanitizeFilename(file.file_name);
	const fromPath = filePath?.split("/").pop();
	if (fromPath) return sanitizeFilename(fromPath);
	const ext = extensionFromMime(mimeType) ?? "bin";
	return sanitizeFilename(`${file.type}_${file.file_unique_id}.${ext}`);
}

function inferNotionBlockType(file: FileInfo, mimeType: string, filename: string): NotionAttachmentBlockType {
	const lowerMime = mimeType.toLowerCase();
	const lowerName = filename.toLowerCase();
	if (lowerMime.startsWith("image/")) return "image";
	if (lowerMime.startsWith("video/")) return "video";
	if (lowerMime.startsWith("audio/")) return "audio";
	if (lowerMime === "application/pdf" || lowerName.endsWith(".pdf")) return "pdf";
	if (file.type === "photo") return "image";
	if (file.type === "video" || file.type === "video_note") return "video";
	if (file.type === "audio" || file.type === "voice") return "audio";
	return "file";
}

function splitText(value: string, maxLen = 1900): string[] {
	if (value.length === 0) return [""];
	const chunks: string[] = [];
	for (let i = 0; i < value.length; i += maxLen) {
		chunks.push(value.slice(i, i + maxLen));
	}
	return chunks;
}

function toRichText(value: string): Array<{ type: "text"; text: { content: string } }> {
	return splitText(value).map((chunk) => ({ type: "text", text: { content: chunk } }));
}

function buildJsonCodeBlock(payload: Record<string, unknown>): Record<string, unknown> {
	return {
		object: "block",
		type: "code",
		code: {
			language: "json",
			rich_text: toRichText(JSON.stringify(payload, null, 2)),
		},
	};
}

function buildAttachmentBlock(blockType: NotionAttachmentBlockType, fileUploadId: string, caption: string): Record<string, unknown> {
	const block: Record<string, unknown> = { object: "block", type: blockType };
	block[blockType] = {
		type: "file_upload",
		file_upload: { id: fileUploadId },
		caption: toRichText(caption),
	};
	return block;
}

function extractFiles(msg: Record<string, unknown>): FileInfo[] {
	const files: FileInfo[] = [];
	const document = msg.document as { file_id: string; file_unique_id: string; file_size?: number; file_name?: string; mime_type?: string } | undefined;
	if (document) {
		files.push({
			file_id: document.file_id,
			file_unique_id: document.file_unique_id,
			file_size: document.file_size,
			file_name: document.file_name,
			mime_type: document.mime_type,
			type: "document",
		});
	}
	const photo = msg.photo as Array<{ file_id: string; file_unique_id: string; file_size?: number }> | undefined;
	if (photo?.length) {
		const largest = photo[photo.length - 1];
		files.push({
			file_id: largest.file_id,
			file_unique_id: largest.file_unique_id,
			file_size: largest.file_size,
			type: "photo",
		});
	}
	const video = msg.video as { file_id: string; file_unique_id: string; file_size?: number; file_name?: string; mime_type?: string } | undefined;
	if (video) {
		files.push({
			file_id: video.file_id,
			file_unique_id: video.file_unique_id,
			file_size: video.file_size,
			file_name: video.file_name,
			mime_type: video.mime_type,
			type: "video",
		});
	}
	const audio = msg.audio as { file_id: string; file_unique_id: string; file_size?: number; file_name?: string; mime_type?: string } | undefined;
	if (audio) {
		files.push({
			file_id: audio.file_id,
			file_unique_id: audio.file_unique_id,
			file_size: audio.file_size,
			file_name: audio.file_name,
			mime_type: audio.mime_type,
			type: "audio",
		});
	}
	const voice = msg.voice as { file_id: string; file_unique_id: string; file_size?: number; mime_type?: string } | undefined;
	if (voice) {
		files.push({
			file_id: voice.file_id,
			file_unique_id: voice.file_unique_id,
			file_size: voice.file_size,
			mime_type: voice.mime_type,
			type: "voice",
		});
	}
	const videoNote = msg.video_note as { file_id: string; file_unique_id: string; file_size?: number; mime_type?: string } | undefined;
	if (videoNote) {
		files.push({
			file_id: videoNote.file_id,
			file_unique_id: videoNote.file_unique_id,
			file_size: videoNote.file_size,
			mime_type: videoNote.mime_type,
			type: "video_note",
		});
	}
	const animation = msg.animation as { file_id: string; file_unique_id: string; file_size?: number; file_name?: string; mime_type?: string } | undefined;
	if (animation) {
		files.push({
			file_id: animation.file_id,
			file_unique_id: animation.file_unique_id,
			file_size: animation.file_size,
			file_name: animation.file_name,
			mime_type: animation.mime_type,
			type: "animation",
		});
	}
	const sticker = msg.sticker as { file_id: string; file_unique_id: string; file_size?: number; mime_type?: string } | undefined;
	if (sticker) {
		files.push({
			file_id: sticker.file_id,
			file_unique_id: sticker.file_unique_id,
			file_size: sticker.file_size,
			mime_type: sticker.mime_type,
			type: "sticker",
		});
	}
	return files;
}

function getMessage(msg: Record<string, unknown>): { text: string; chat: { id: number; title?: string; type?: string }; message_id: number; message_thread_id?: number; date?: number; caption?: string } | null {
	const chat = msg.chat as { id: number; title?: string; type?: string } | undefined;
	const message_id = msg.message_id as number | undefined;
	if (!chat || message_id == null) return null;
	const text = (msg.text as string) ?? (msg.caption as string) ?? "";
	const caption = msg.caption as string | undefined;
	const date = msg.date as number | undefined;
	const message_thread_id = msg.message_thread_id as number | undefined;
	return { text, chat, message_id, caption, date, ...(message_thread_id != null && { message_thread_id }) };
}

function numberEqualsFilter(property: string, value: number): Record<string, unknown> {
	return {
		property,
		number: { equals: value },
	};
}

async function hasExistingTelegramPage(
	notion: Client,
	databaseId: string,
	input: {
		updateIdProp: string | null;
		updateId: number | undefined;
		chatIdProp: string | null;
		chatId: number;
		messageIdProp: string | null;
		messageId: number;
	},
): Promise<boolean> {
	let filter: Record<string, unknown> | null = null;
	if (input.updateIdProp && input.updateId != null) {
		filter = numberEqualsFilter(input.updateIdProp, input.updateId);
	} else if (input.chatIdProp && input.messageIdProp) {
		filter = {
			and: [
				numberEqualsFilter(input.chatIdProp, input.chatId),
				numberEqualsFilter(input.messageIdProp, input.messageId),
			],
		};
	}
	if (!filter) return false;
	const query = await notion.databases.query({
		database_id: databaseId,
		page_size: 1,
		filter: filter as Parameters<typeof notion.databases.query>[0]["filter"],
	});
	return query.results.length > 0;
}

function parseNotionError(body: string): string {
	try {
		const parsed = JSON.parse(body) as { message?: string };
		return parsed.message ?? body;
	} catch {
		return body;
	}
}

function timingSafeStringEquals(a: string, b: string): boolean {
	const aBytes = new TextEncoder().encode(a);
	const bBytes = new TextEncoder().encode(b);
	const len = Math.max(aBytes.length, bBytes.length);
	let diff = aBytes.length ^ bBytes.length;
	for (let i = 0; i < len; i++) {
		diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
	}
	return diff === 0;
}

function isTrueEnvFlag(value: string | undefined): boolean {
	if (!value) return false;
	return /^(1|true|yes|on)$/i.test(value.trim());
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`Notion API response missing ${field}`);
	}
}

function getHeaderValue(headers: Record<string, unknown>, name: string): string | null {
	const raw = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
	if (Array.isArray(raw)) {
		const first = raw[0];
		return typeof first === "string" ? first : null;
	}
	return typeof raw === "string" ? raw : null;
}

function isAuthorizedTelegramWebhookRequest(secretHeader: string | null, requireSecret: boolean): boolean {
	if (!requireSecret) return true;
	const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN;
	if (!expectedSecret) return true;
	if (!secretHeader) return false;
	return timingSafeStringEquals(secretHeader, expectedSecret);
}

async function notionJsonRequest<T>(
	notionToken: string,
	path: string,
	method: "POST" | "PATCH" | "GET",
	body?: Record<string, unknown>,
): Promise<T> {
	const response = await fetch(`${NOTION_API_BASE}/${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${notionToken}`,
			"Notion-Version": NOTION_API_VERSION,
			...(body ? { "Content-Type": "application/json" } : {}),
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	const raw = await response.text();
	if (!response.ok) {
		throw new Error(`Notion API ${method} /${path} failed: ${response.status} ${parseNotionError(raw)}`);
	}
	if (!raw) return {} as T;
	return JSON.parse(raw) as T;
}

async function notionSendFileUploadPart(
	notionToken: string,
	fileUploadId: string,
	bytes: Uint8Array,
	filename: string,
	mimeType: string,
	partNumber?: number,
): Promise<void> {
	const formData = new FormData();
	const blobBytes = new Uint8Array(bytes);
	formData.append("file", new Blob([blobBytes], { type: mimeType }), filename);
	if (partNumber != null) {
		formData.append("part_number", String(partNumber));
	}

	const response = await fetch(`${NOTION_API_BASE}/file_uploads/${fileUploadId}/send`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${notionToken}`,
			"Notion-Version": NOTION_API_VERSION,
		},
		body: formData,
	});
	if (!response.ok) {
		const raw = await response.text();
		throw new Error(`Notion API POST /file_uploads/${fileUploadId}/send failed: ${response.status} ${parseNotionError(raw)}`);
	}
}

async function appendBlocksViaNotionApi(
	notionToken: string,
	pageId: string,
	blocks: Record<string, unknown>[],
): Promise<void> {
	for (let i = 0; i < blocks.length; i += NOTION_BLOCK_APPEND_BATCH_SIZE) {
		const batch = blocks.slice(i, i + NOTION_BLOCK_APPEND_BATCH_SIZE);
		await notionJsonRequest(
			notionToken,
			`blocks/${encodeURIComponent(pageId)}/children`,
			"PATCH",
			{ children: batch },
		);
	}
}

async function appendBlocksViaClient(
	notion: Client,
	pageId: string,
	blocks: Record<string, unknown>[],
): Promise<void> {
	if (blocks.length === 0) return;
	for (let i = 0; i < blocks.length; i += NOTION_BLOCK_APPEND_BATCH_SIZE) {
		const batch = blocks.slice(i, i + NOTION_BLOCK_APPEND_BATCH_SIZE);
		await notion.blocks.children.append({
			block_id: pageId,
			children: batch as unknown as Parameters<Client["blocks"]["children"]["append"]>[0]["children"],
		});
	}
}

async function telegramApi<T>(token: string, method: string, params?: Record<string, unknown>): Promise<T> {
	const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: params ? JSON.stringify(params) : undefined,
	});
	const payload = (await response.json()) as { ok: boolean; result?: T; description?: string };
	if (!payload.ok) {
		throw new Error(payload.description ?? `Telegram API ${method} failed`);
	}
	return payload.result as T;
}

async function uploadTelegramFileToNotion(
	telegramToken: string,
	notionToken: string,
	file: FileInfo,
): Promise<{ uploadState: AttachmentUploadState; block?: Record<string, unknown> }> {
	const fallbackMime = file.mime_type ?? "application/octet-stream";
	const fallbackFileName = sanitizeFilename(file.file_name ?? `${file.type}_${file.file_unique_id}`);
	const maxUploadBytes = getMaxUploadBytes();

	const baseState = {
		file_id: file.file_id,
		file_unique_id: file.file_unique_id,
		type: file.type,
		file_name: fallbackFileName,
		mime_type: fallbackMime,
		size_bytes: file.file_size ?? 0,
	} satisfies Omit<AttachmentUploadState, "status">;

	try {
		const meta = await telegramApi<{ file_path?: string; file_size?: number }>(telegramToken, "getFile", {
			file_id: file.file_id,
		});
		if (!meta.file_path) {
			return {
				uploadState: {
					...baseState,
					status: "failed",
					reason: "Telegram getFile did not return file_path",
				},
			};
		}

		const downloadResponse = await fetch(`https://api.telegram.org/file/bot${telegramToken}/${meta.file_path}`);
		if (!downloadResponse.ok) {
			return {
				uploadState: {
					...baseState,
					status: "failed",
					reason: `Telegram file download failed: ${downloadResponse.status}`,
				},
			};
		}

		const payload = new Uint8Array(await downloadResponse.arrayBuffer());
		const actualSize = payload.byteLength;
		const mimeType = inferMimeType(file, downloadResponse.headers.get("content-type"), meta.file_path);
		const filename = inferFilename(file, meta.file_path, mimeType);

		if (actualSize > maxUploadBytes) {
			return {
				uploadState: {
					...baseState,
					file_name: filename,
					mime_type: mimeType,
					size_bytes: actualSize,
					status: "skipped",
					reason: `File exceeds TELEGRAM_NOTION_MAX_FILE_BYTES (${maxUploadBytes})`,
				},
			};
		}

		const numberOfParts = Math.max(1, Math.ceil(actualSize / NOTION_SINGLE_PART_UPLOAD_BYTES));
		const createPayload: Record<string, unknown> =
			numberOfParts > 1
				? { mode: "multi_part", filename, content_type: mimeType, number_of_parts: numberOfParts }
				: { mode: "single_part", filename, content_type: mimeType };

		const created = await notionJsonRequest<{ id: string }>(notionToken, "file_uploads", "POST", createPayload);
		assertNonEmptyString(created.id, "file_upload.id");

		for (let part = 0; part < numberOfParts; part++) {
			const start = part * NOTION_SINGLE_PART_UPLOAD_BYTES;
			const end = Math.min(start + NOTION_SINGLE_PART_UPLOAD_BYTES, actualSize);
			const partBytes = payload.subarray(start, end);
			await notionSendFileUploadPart(
				notionToken,
				created.id,
				partBytes,
				filename,
				mimeType,
				numberOfParts > 1 ? part + 1 : undefined,
			);
		}

		if (numberOfParts > 1) {
			await notionJsonRequest(notionToken, `file_uploads/${encodeURIComponent(created.id)}/complete`, "POST");
		}

		const blockType = inferNotionBlockType(file, mimeType, filename);
		return {
			uploadState: {
				...baseState,
				file_name: filename,
				mime_type: mimeType,
				size_bytes: actualSize,
				status: "uploaded",
				notion_file_upload_id: created.id,
				notion_block_type: blockType,
			},
			block: buildAttachmentBlock(blockType, created.id, `${filename} (${file.type}, ${actualSize} bytes)`),
		};
	} catch (err) {
		return {
			uploadState: {
				...baseState,
				status: "failed",
				reason: err instanceof Error ? err.message : "Unknown upload error",
			},
		};
	}
}

export const config = { api: { bodyParser: true } };

async function setMessageReaction(chatId: number, messageId: number, messageThreadId?: number): Promise<void> {
	const token = process.env.TELEGRAM_BOT_TOKEN;
	if (!token) return;
	const body: Record<string, unknown> = {
		chat_id: chatId,
		message_id: messageId,
		reaction: [{ type: "emoji", emoji: "👀" }],
	};
	if (messageThreadId != null) {
		body.message_thread_id = messageThreadId;
	}
	await fetch(`https://api.telegram.org/bot${token}/setMessageReaction`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
	if (req.method !== "POST") {
		return res.status(404).send("Not Found");
	}

	const requireSecret = isTrueEnvFlag(process.env.TELEGRAM_WEBHOOK_REQUIRE_SECRET_TOKEN);
	if (requireSecret && !process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN) {
		return res.status(500).json({ ok: false, error: "Server misconfigured: TELEGRAM_WEBHOOK_SECRET_TOKEN is required when TELEGRAM_WEBHOOK_REQUIRE_SECRET_TOKEN=true" });
	}

	const secretHeader = getHeaderValue((req.headers as Record<string, unknown>) ?? {}, TELEGRAM_SECRET_HEADER);
	if (!isAuthorizedTelegramWebhookRequest(secretHeader, requireSecret)) {
		return res.status(401).json({ ok: false, error: "Unauthorized webhook request" });
	}

	const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
	const notionToken = process.env.NOTION_API_TOKEN;
	const databaseId = process.env.NOTION_DATABASE_ID ?? "312009f00c208036be25c17b44b2c667";

	if (!notionToken || !telegramToken) {
		console.error("Missing NOTION_API_TOKEN or TELEGRAM_BOT_TOKEN");
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
	if (typeof update.update_id !== "number") {
		return res.status(400).json({ ok: false, error: "Invalid Telegram update payload" });
	}
	const msg = (update.message ?? update.channel_post ?? update.edited_message) as Record<string, unknown> | undefined;
	const updateId = typeof update.update_id === "number" ? (update.update_id as number) : undefined;

	if (!msg || typeof msg !== "object") {
		return res.json({ ok: true });
	}

	const parsed = getMessage(msg);
	if (!parsed) {
		return res.json({ ok: true });
	}

	const { text, chat, message_id, message_thread_id, date, caption } = parsed;
	const chatLabel = chat.title ?? `Chat ${chat.id}`;
	const title = text.trim().slice(0, 100) || `[${chatLabel}] Message #${message_id}`;
	const files = extractFiles(msg);
	const fileSummary = files.length > 0 ? `\n\nAttachments: ${files.map((f) => f.type).join(", ")}` : "";
	const topicInfo = message_thread_id != null ? `\nTopic/Thread ID: ${message_thread_id}` : "";
	const updateLine = updateId != null ? `Update ID: ${updateId}\n` : "";
	const content = `From: ${chatLabel} (${chat.type ?? "chat"})${topicInfo}
Chat ID: ${chat.id}
${updateLine}Message ID: ${message_id}
${text}${fileSummary}`;

	const notion = new Client({ auth: notionToken, notionVersion: NOTION_API_VERSION });
	const dbId = formatDatabaseId(databaseId);

	try {
		const properties = await getNotionSchemaProperties(notionToken, dbId);
		const schema = resolveTelegramNotionSchema(properties);
		if (!schema) {
			logNotionFailure("Notion schema unavailable", new Error("Notion data source returned no properties"), {
				database_id: dbId,
				chat_id: chat.id,
				message_id,
				update_id: updateId ?? null,
				phase: "database_retrieve",
			});
			return res.status(500).json({ ok: false, error: "Cannot read Notion database schema" });
		}
		const { titleProp, chatIdProp, topicIdProp, messageIdProp, updateIdProp, statusProp, statusNotStarted } =
			schema;
		if (
			await hasExistingTelegramPage(notion, dbId, {
				updateIdProp,
				updateId,
				chatIdProp,
				chatId: chat.id,
				messageIdProp,
				messageId: message_id,
			})
		) {
			return res.json({ ok: true });
		}
		const pageProps: Record<string, unknown> = {
			[titleProp]: {
				title: [{ type: "text", text: { content: title } }],
			},
		};
		if (chatIdProp) pageProps[chatIdProp] = { number: chat.id };
		if (topicIdProp && message_thread_id != null) pageProps[topicIdProp] = { number: message_thread_id };
		if (messageIdProp) pageProps[messageIdProp] = { number: message_id };
		if (updateIdProp && updateId != null) pageProps[updateIdProp] = { number: updateId };
		if (statusProp && statusNotStarted) pageProps[statusProp] = { status: { name: statusNotStarted } };

		const baseState = {
			update_id: updateId ?? null,
			update_type: update.message ? "message" : update.channel_post ? "channel_post" : "edited_message",
			chat: { id: chat.id, title: chat.title ?? null, type: chat.type ?? null },
			message: {
				message_id,
				message_thread_id: message_thread_id ?? null,
				date: date ?? null,
				text: (msg.text as string | undefined) ?? null,
				caption: caption ?? null,
			},
			attachments: files,
			upload_config: {
				notion_api_version: NOTION_API_VERSION,
				max_file_bytes: getMaxUploadBytes(),
			},
		};

		const page = await notion.pages.create({
			parent: { database_id: dbId },
			properties: pageProps as Parameters<typeof notion.pages.create>[0]["properties"],
			children: [
				{
					object: "block",
					type: "paragraph",
					paragraph: {
						rich_text: toRichText(content),
					},
				},
				buildJsonCodeBlock(baseState),
			] as unknown as Parameters<typeof notion.pages.create>[0]["children"],
		});
		assertNonEmptyString(page.id, "page.id");

		if (files.length > 0) {
			const uploadStates: AttachmentUploadState[] = [];
			const uploadedBlocks: Record<string, unknown>[] = [];
			for (const file of files) {
				const result = await uploadTelegramFileToNotion(telegramToken, notionToken, file);
				uploadStates.push(result.uploadState);
				if (result.block) uploadedBlocks.push(result.block);
			}

			await appendBlocksViaClient(notion, page.id, [
				buildJsonCodeBlock({
					upload_synced_at: new Date().toISOString(),
					uploads: uploadStates,
				}),
			]);

			if (uploadedBlocks.length > 0) {
				try {
					await appendBlocksViaNotionApi(notionToken, page.id, uploadedBlocks);
				} catch (err) {
					await appendBlocksViaClient(notion, page.id, [
						buildJsonCodeBlock({
							upload_block_append_error: err instanceof Error ? err.message : "Unknown append error",
						}),
					]);
				}
			}
		}

		// Send immediate confirmation so user knows it worked (incl. forum topics)
		await setMessageReaction(chat.id, message_id, message_thread_id);
	} catch (err) {
		logNotionFailure("Notion create failed", err, {
			database_id: dbId,
			chat_id: chat.id,
			message_id,
			update_id: updateId ?? null,
			phase: "create_page",
		});
		return res.status(500).json({
			ok: false,
			error: err instanceof Error ? err.message : "Notion API error",
		});
	}

	return res.json({ ok: true });
}
