/**
 * Summarize Page Worker
 * Fetches page content from URLs (Notion or external) and returns AI-generated summaries.
 */

import type { Worker } from "@project-ajax/sdk";
import type { JSONSchemaType } from "ajv";

function extractNotionPageId(url: string): string | null {
	try {
		const urlObj = new URL(url);
		if (!urlObj.hostname.includes("notion.so")) return null;
		const pathSegments = urlObj.pathname.split("-").filter(Boolean);
		if (pathSegments.length === 0) return null;
		const lastSegment = pathSegments[pathSegments.length - 1];
		if (lastSegment.length === 32) {
			return `${lastSegment.slice(0, 8)}-${lastSegment.slice(8, 12)}-${lastSegment.slice(12, 16)}-${lastSegment.slice(16, 20)}-${lastSegment.slice(20, 32)}`;
		}
		if (lastSegment.length === 36 && lastSegment.includes("-")) return lastSegment;
		return null;
	} catch {
		return null;
	}
}

function extractRichText(richText: unknown[]): string {
	if (!richText || !Array.isArray(richText)) return "";
	return richText.map((t) => (t as { plain_text?: string }).plain_text || "").join("");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchNotionContent(pageId: string, notion: any): Promise<string> {
	const page = await notion.pages.retrieve({ page_id: pageId });
	const blocks = await notion.blocks.children.list({ block_id: pageId });

	const extractTextFromBlocks = async (blockList: unknown[]): Promise<string> => {
		let text = "";
		for (const block of blockList) {
			const b = block as Record<string, unknown>;
			if (b.type === "paragraph" && b.paragraph) {
				text += extractRichText((b.paragraph as { rich_text: unknown[] }).rich_text) + "\n\n";
			} else if (b.type === "heading_1" && b.heading_1) {
				text += extractRichText((b.heading_1 as { rich_text: unknown[] }).rich_text) + "\n\n";
			} else if (b.type === "heading_2" && b.heading_2) {
				text += extractRichText((b.heading_2 as { rich_text: unknown[] }).rich_text) + "\n\n";
			} else if (b.type === "heading_3" && b.heading_3) {
				text += extractRichText((b.heading_3 as { rich_text: unknown[] }).rich_text) + "\n\n";
			} else if (b.type === "bulleted_list_item" && b.bulleted_list_item) {
				text += "• " + extractRichText((b.bulleted_list_item as { rich_text: unknown[] }).rich_text) + "\n";
			} else if (b.type === "numbered_list_item" && b.numbered_list_item) {
				text += "• " + extractRichText((b.numbered_list_item as { rich_text: unknown[] }).rich_text) + "\n";
			} else if (b.type === "quote" && b.quote) {
				text += "> " + extractRichText((b.quote as { rich_text: unknown[] }).rich_text) + "\n\n";
			} else if (b.type === "code" && b.code) {
				text += extractRichText((b.code as { rich_text: unknown[] }).rich_text) + "\n\n";
			} else if (b.type === "callout" && b.callout) {
				text += extractRichText((b.callout as { rich_text: unknown[] }).rich_text) + "\n\n";
			}
			if ((b as { has_children?: boolean }).has_children) {
				const childBlocks = await notion.blocks.children.list({ block_id: b.id as string });
				text += await extractTextFromBlocks(childBlocks.results);
			}
		}
		return text;
	};

	let title = "";
	if (page.properties) {
		for (const prop of Object.values(page.properties)) {
			const p = prop as { type?: string; title?: { plain_text?: string }[] };
			if (p?.type === "title" && p.title) {
				title = p.title.map((t) => t.plain_text || "").join("");
				break;
			}
		}
	}
	const content = await extractTextFromBlocks(blocks.results);
	return title ? `${title}\n\n${content}` : content;
}

async function fetchExternalContent(url: string): Promise<string> {
	const response = await fetch(url, {
		headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
	});
	if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
	const html = await response.text();
	let text = html
		.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
		.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
	const contentTags = [/<h1[^>]*>(.*?)<\/h1>/gi, /<h2[^>]*>(.*?)<\/h2>/gi, /<h3[^>]*>(.*?)<\/h3>/gi, /<p[^>]*>(.*?)<\/p>/gi, /<article[^>]*>(.*?)<\/article>/gi, /<main[^>]*>(.*?)<\/main>/gi];
	let extractedText = "";
	for (const tagRegex of contentTags) {
		for (const match of text.matchAll(tagRegex)) {
			if (match[1]) {
				const cleanText = match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
				if (cleanText.length > 10) extractedText += cleanText + "\n\n";
			}
		}
	}
	if (extractedText.trim().length < 100) {
		extractedText = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
	}
	return extractedText.slice(0, 50000);
}

async function generateSummary(content: string, notion: unknown, parentPageId: string): Promise<string> {
	const n = notion as {
		pages: { create: (p: object) => Promise<{ id: string }>; update: (p: object) => Promise<unknown> };
		blocks: { children: { append: (p: object) => Promise<{ results: { id?: string }[] }>; list: (p: object) => Promise<{ results: unknown[] }> }; retrieve: (p: object) => Promise<{ type?: string; ai_block?: unknown }> };
	};
	const tempPage = await n.pages.create({
		parent: { page_id: parentPageId },
		properties: { title: { title: [{ text: { content: "Temporary Summary Page" } }] } },
	});
	const tempPageId = tempPage.id;
	try {
		await n.blocks.children.append({
			block_id: tempPageId,
			children: [{ type: "paragraph", paragraph: { rich_text: [{ text: { content: content.slice(0, 20000) } }] } }],
		});
		const aiBlockResponse = await n.blocks.children.append({
			block_id: tempPageId,
			children: [{ type: "ai_block", ai_block: { prompt: "Please provide a concise summary (2-3 paragraphs) of the content above. Capture the key points and main ideas." } }],
		});
		const aiBlockId = aiBlockResponse.results[0]?.id;
		if (!aiBlockId) throw new Error("Failed to create AI block");
		let summary = "";
		for (let attempt = 0; attempt < 30; attempt++) {
			await new Promise((r) => setTimeout(r, 1000));
			const block = await n.blocks.retrieve({ block_id: aiBlockId });
			if (block.type === "ai_block" && block.ai_block) {
				const children = await n.blocks.children.list({ block_id: aiBlockId });
				for (const childBlock of children.results) {
					const c = childBlock as Record<string, unknown>;
					if (c.type === "paragraph" && c.paragraph) {
						summary += extractRichText((c.paragraph as { rich_text: unknown[] }).rich_text) + "\n\n";
					} else if (c.type === "heading_1" && c.heading_1) {
						summary += extractRichText((c.heading_1 as { rich_text: unknown[] }).rich_text) + "\n\n";
					} else if (c.type === "heading_2" && c.heading_2) {
						summary += extractRichText((c.heading_2 as { rich_text: unknown[] }).rich_text) + "\n\n";
					} else if (c.type === "heading_3" && c.heading_3) {
						summary += extractRichText((c.heading_3 as { rich_text: unknown[] }).rich_text) + "\n\n";
					}
				}
				if (summary.trim().length > 0) break;
			}
		}
		if (!summary || summary.trim().length === 0) {
			const truncated = content.slice(0, 1500).trim();
			return truncated.length > 0 ? truncated + (content.length > 1500 ? "..." : "") : "Unable to generate summary.";
		}
		return summary.trim();
	} finally {
		try {
			await n.pages.update({ page_id: tempPageId, archived: true });
		} catch {
			/* ignore */
		}
	}
}

export function registerSummarizeTool(worker: Worker): void {
	const inputSchema: JSONSchemaType<{ url: string; parentPageId?: string }> = {
		type: "object",
		properties: {
			url: { type: "string", description: "URL of the page to summarize (Notion or external)" },
			parentPageId: { type: "string", nullable: true, description: "Notion page ID for AI summary (required for external URLs)" },
		},
		required: ["url"],
		additionalProperties: false,
	};
	const outputSchema: JSONSchemaType<{ summary: string }> = {
		type: "object",
		properties: { summary: { type: "string", description: "AI-generated summary" } },
		required: ["summary"],
		additionalProperties: false,
	};

	worker.tool<{ url: string; parentPageId?: string }, { summary: string }>("summarizePage", {
		title: "Summarize Page",
		description: "Fetches page content from a URL and returns an AI-generated summary. Supports Notion pages and external URLs.",
		schema: inputSchema,
		outputSchema,
		execute: async (input, { notion }) => {
			try {
				new URL(input.url);
			} catch {
				throw new Error(`Invalid URL: ${input.url}`);
			}
			const notionPageId = extractNotionPageId(input.url);
			let content: string;
			let pageIdForParent: string | undefined;
			if (notionPageId) {
				content = await fetchNotionContent(notionPageId, notion);
				pageIdForParent = input.parentPageId || notionPageId;
			} else {
				content = await fetchExternalContent(input.url);
				if (!input.parentPageId) throw new Error("parentPageId is required for external URLs.");
				pageIdForParent = input.parentPageId;
			}
			if (!content || content.trim().length < 50) {
				throw new Error("Unable to extract sufficient content from the page.");
			}
			try {
				const summary = await generateSummary(content, notion, pageIdForParent);
				return { summary };
			} catch {
				const truncated = content.slice(0, 1500).trim();
				return { summary: truncated.length > 0 ? truncated + (content.length > 1500 ? "..." : "") : "Content extracted but AI summary failed." };
			}
		},
	});
}
