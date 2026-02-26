/**
 * Telegram → Notion ingestion
 * Fetches Telegram updates and creates Notion database pages.
 * When a page is created, Custom Agents with "page added to database" trigger will run.
 */

import type { Worker } from "@project-ajax/sdk";
import type { JSONSchemaType } from "ajv";
import type { Client } from "@notionhq/client";
import { getBotToken, getFileDownloadUrl, telegramApi } from "../api.js";
import { extractFilesFromMessage, type FileInfo } from "../utils.js";

const DEFAULT_DATABASE_ID = "312009f00c208036be25c17b44b2c667";
const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_API_VERSION = process.env.NOTION_API_VERSION ?? "2025-09-03";
const NOTION_SINGLE_PART_UPLOAD_BYTES = 20 * 1024 * 1024;
const DEFAULT_TELEGRAM_NOTION_MAX_FILE_BYTES = 100 * 1024 * 1024;
const NOTION_BLOCK_APPEND_BATCH_SIZE = 100;

type NotionAttachmentBlockType = "image" | "video" | "audio" | "pdf" | "file";

type TelegramMessage = {
	message_id: number;
	message_thread_id?: number;
	text?: string;
	caption?: string;
	date?: number;
	chat: { id: number; title?: string; type?: string };
	document?: { file_id: string; file_unique_id: string; file_size?: number; file_name?: string; mime_type?: string };
	photo?: Array<{ file_id: string; file_unique_id: string; file_size?: number }>;
	video?: { file_id: string; file_unique_id: string; file_size?: number; file_name?: string; mime_type?: string };
	audio?: { file_id: string; file_unique_id: string; file_size?: number; file_name?: string; mime_type?: string };
	voice?: { file_id: string; file_unique_id: string; file_size?: number; mime_type?: string };
	video_note?: { file_id: string; file_unique_id: string; file_size?: number; mime_type?: string };
	animation?: { file_id: string; file_unique_id: string; file_size?: number; file_name?: string; mime_type?: string };
	sticker?: { file_id: string; file_unique_id: string; file_size?: number; mime_type?: string };
};

type TelegramUpdate = {
	update_id: number;
	message?: TelegramMessage;
	channel_post?: TelegramMessage;
	edited_message?: TelegramMessage;
};

type NotionFileUploadCreateResponse = {
	id: string;
};

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
	const normalized = mime.toLowerCase();
	return MIME_TO_EXTENSION[normalized];
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
	const block: Record<string, unknown> = {
		object: "block",
		type: blockType,
	};
	block[blockType] = {
		type: "file_upload",
		file_upload: { id: fileUploadId },
		caption: toRichText(caption),
	};
	return block;
}

function normalizeName(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findPropertyName(
	properties: Record<string, { type?: string }>,
	type: string,
	candidates: string[],
): string | null {
	const wanted = new Set(candidates.map(normalizeName));
	for (const [name, prop] of Object.entries(properties)) {
		if (prop?.type !== type) continue;
		if (wanted.has(normalizeName(name))) return name;
	}
	return null;
}

function parseNotionError(body: string): string {
	try {
		const parsed = JSON.parse(body) as { message?: string };
		return parsed.message ?? body;
	} catch {
		return body;
	}
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
	formData.append("file", new Blob([bytes], { type: mimeType }), filename);
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

async function uploadTelegramFileToNotion(
	botToken: string,
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
		const fileMeta = await telegramApi<{ file_path?: string; file_size?: number }>(botToken, "getFile", {
			file_id: file.file_id,
		});
		if (!fileMeta.file_path) {
			return {
				uploadState: {
					...baseState,
					status: "failed",
					reason: "Telegram getFile did not return file_path",
				},
			};
		}

		const downloadUrl = getFileDownloadUrl(botToken, fileMeta.file_path);
		const downloadResponse = await fetch(downloadUrl);
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
		const mimeType = inferMimeType(file, downloadResponse.headers.get("content-type"), fileMeta.file_path);
		const filename = inferFilename(file, fileMeta.file_path, mimeType);

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

		const fileUpload = await notionJsonRequest<NotionFileUploadCreateResponse>(
			notionToken,
			"file_uploads",
			"POST",
			createPayload,
		);

		for (let part = 0; part < numberOfParts; part++) {
			const start = part * NOTION_SINGLE_PART_UPLOAD_BYTES;
			const end = Math.min(start + NOTION_SINGLE_PART_UPLOAD_BYTES, actualSize);
			const partBytes = payload.subarray(start, end);
			await notionSendFileUploadPart(
				notionToken,
				fileUpload.id,
				partBytes,
				filename,
				mimeType,
				numberOfParts > 1 ? part + 1 : undefined,
			);
		}

		if (numberOfParts > 1) {
			await notionJsonRequest(notionToken, `file_uploads/${encodeURIComponent(fileUpload.id)}/complete`, "POST");
		}

		const blockType = inferNotionBlockType(file, mimeType, filename);
		const block = buildAttachmentBlock(
			blockType,
			fileUpload.id,
			`${filename} (${file.type}, ${actualSize} bytes)`,
		);

		return {
			uploadState: {
				...baseState,
				file_name: filename,
				mime_type: mimeType,
				size_bytes: actualSize,
				status: "uploaded",
				notion_file_upload_id: fileUpload.id,
				notion_block_type: blockType,
			},
			block,
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

async function appendBlocksViaClient(
	notionClient: Client,
	pageId: string,
	blocks: Record<string, unknown>[],
): Promise<void> {
	if (blocks.length === 0) return;
	for (let i = 0; i < blocks.length; i += NOTION_BLOCK_APPEND_BATCH_SIZE) {
		const batch = blocks.slice(i, i + NOTION_BLOCK_APPEND_BATCH_SIZE);
		await notionClient.blocks.children.append({
			block_id: pageId,
			children: batch as unknown as Parameters<Client["blocks"]["children"]["append"]>[0]["children"],
		});
	}
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
				"Fetch recent Telegram messages, upload Telegram attachments directly to Notion, and create a Notion page for each update. Use this when the Custom Agent runs on a schedule (e.g. every 5 min). Creating a page triggers agents with 'page added to database' trigger.",
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
				const notionToken = process.env.NOTION_API_TOKEN;
				const dbId = formatDatabaseId(input.database_id ?? DEFAULT_DATABASE_ID);
				const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
				const notionClient = notion as Client;

				// Fetch database schema to get title property name
				const db = await notionClient.databases.retrieve({ database_id: dbId });
				const props = db.properties as Record<string, { type?: string; status?: { options?: { name: string }[] } }>;
				const titleProp = getTitlePropertyName(props);
				const chatIdProp = findPropertyName(props, "number", ["Chat ID", "Telegram Chat ID"]);
				const topicIdProp = findPropertyName(props, "number", ["Topic ID", "Telegram Topic ID", "Thread ID", "Message Thread ID"]);
				const messageIdProp = findPropertyName(props, "number", ["Message ID", "Telegram Message ID"]);
				const updateIdProp = findPropertyName(props, "number", ["Update ID", "Telegram Update ID"]);
				let statusProp: string | null = null;
				let statusNotStarted: string | null = null;

				for (const [name, prop] of Object.entries(props)) {
					if (prop?.type !== "status") continue;
					statusProp = name;
					const opts = prop?.status?.options;
					const notStarted = opts?.find((o) => /not\s*started/i.test(o.name));
					statusNotStarted = notStarted?.name ?? opts?.[0]?.name ?? null;
				}

				// Fetch Telegram updates
				const result = await telegramApi<TelegramUpdate[]>(token, "getUpdates", {
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
					const messageThreadId = msg.message_thread_id;
					const title =
						text.trim().slice(0, 100) || `[${chatLabel}] Message #${msg.message_id}`;

					const files = extractFilesFromMessage(msg as Record<string, unknown>);
					const fileSummary = files.length > 0 ? `\n\nAttachments: ${files.map((f) => f.type).join(", ")}` : "";
					const topicSummary = messageThreadId != null ? `\nTopic/Thread ID: ${messageThreadId}` : "";

					const content = `From: ${chatLabel} (${chat.type ?? "chat"})
${topicSummary ? topicSummary.trimStart() + "\n" : ""}Chat ID: ${chat.id}
Update ID: ${u.update_id}
Message ID: ${msg.message_id}
${text}${fileSummary}`.trim();

					const baseState = {
						update_id: u.update_id,
						update_type: u.message ? "message" : u.channel_post ? "channel_post" : "edited_message",
						chat: {
							id: chat.id,
							title: chat.title ?? null,
							type: chat.type ?? null,
						},
						message: {
							message_id: msg.message_id,
							message_thread_id: messageThreadId ?? null,
							date: (msg as { date?: number }).date ?? null,
							text: msg.text ?? null,
							caption: (msg as { caption?: string }).caption ?? null,
						},
						attachments: files,
						upload_config: {
							notion_api_version: NOTION_API_VERSION,
							max_file_bytes: getMaxUploadBytes(),
							notion_token_present: Boolean(notionToken),
						},
						...(files.length > 0 && !notionToken
							? {
									uploads: files.map((f) => ({
										file_id: f.file_id,
										file_unique_id: f.file_unique_id,
										type: f.type,
										file_name: f.file_name ?? `${f.type}_${f.file_unique_id}`,
										mime_type: f.mime_type ?? "application/octet-stream",
										size_bytes: f.file_size ?? 0,
										status: "skipped",
										reason: "NOTION_API_TOKEN is missing; cannot upload Telegram files",
									} satisfies AttachmentUploadState)),
								}
							: {}),
					};

					const pageProps: Record<string, unknown> = {
						[titleProp]: {
							title: [{ type: "text", text: { content: title } }],
						},
					};
					if (chatIdProp) pageProps[chatIdProp] = { number: chat.id };
					if (topicIdProp && messageThreadId != null) pageProps[topicIdProp] = { number: messageThreadId };
					if (messageIdProp) pageProps[messageIdProp] = { number: msg.message_id };
					if (updateIdProp) pageProps[updateIdProp] = { number: u.update_id };
					if (statusProp && statusNotStarted) pageProps[statusProp] = { status: { name: statusNotStarted } };

					const page = await notionClient.pages.create({
						parent: { database_id: dbId },
						properties: pageProps as Parameters<Client["pages"]["create"]>[0]["properties"],
						children: [
							{
								object: "block",
								type: "paragraph",
								paragraph: {
									rich_text: toRichText(content),
								},
							},
							buildJsonCodeBlock(baseState),
						] as unknown as Parameters<Client["pages"]["create"]>[0]["children"],
					});

					if (files.length > 0) {
						const uploadStates: AttachmentUploadState[] = [];
						const uploadedBlocks: Record<string, unknown>[] = [];

						if (!notionToken) {
							for (const f of files) {
								uploadStates.push({
									file_id: f.file_id,
									file_unique_id: f.file_unique_id,
									type: f.type,
									file_name: f.file_name ?? `${f.type}_${f.file_unique_id}`,
									mime_type: f.mime_type ?? "application/octet-stream",
									size_bytes: f.file_size ?? 0,
									status: "skipped",
									reason: "NOTION_API_TOKEN is missing; cannot upload Telegram files",
								});
							}
						} else {
							for (const f of files) {
								const result = await uploadTelegramFileToNotion(token, notionToken, f);
								uploadStates.push(result.uploadState);
								if (result.block) uploadedBlocks.push(result.block);
							}
						}

						await appendBlocksViaClient(notionClient, page.id, [
							buildJsonCodeBlock({
								upload_synced_at: new Date().toISOString(),
								uploads: uploadStates,
							}),
						]);

						if (notionToken && uploadedBlocks.length > 0) {
							try {
								await appendBlocksViaClient(notionClient, page.id, uploadedBlocks);
							} catch (err) {
								await appendBlocksViaClient(notionClient, page.id, [
									buildJsonCodeBlock({
										upload_block_append_error: err instanceof Error ? err.message : "Unknown append error",
									}),
								]);
							}
						}
					}

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
