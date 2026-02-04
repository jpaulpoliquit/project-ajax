import { Worker } from "@project-ajax/sdk";
import type { JSONSchemaType } from "ajv";

const worker = new Worker();
export default worker;

/**
 * Extracts page ID from a Notion URL.
 * Supports formats like:
 * - https://www.notion.so/Page-Title-abc123def456
 * - https://notion.so/Page-Title-abc123def456
 * - https://www.notion.so/abc123def456
 */
function extractNotionPageId(url: string): string | null {
	try {
		const urlObj = new URL(url);
		if (!urlObj.hostname.includes("notion.so")) {
			return null;
		}

		// Extract the last segment which contains the page ID
		const pathSegments = urlObj.pathname.split("-").filter(Boolean);
		if (pathSegments.length === 0) {
			return null;
		}

		// The page ID is the last segment (32 char hex string)
		const lastSegment = pathSegments[pathSegments.length - 1];
		
		// Notion page IDs are 32 characters (UUID without dashes)
		// They can also be in UUID format with dashes
		if (lastSegment.length === 32) {
			// Format as UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
			return `${lastSegment.slice(0, 8)}-${lastSegment.slice(8, 12)}-${lastSegment.slice(12, 16)}-${lastSegment.slice(16, 20)}-${lastSegment.slice(20, 32)}`;
		} else if (lastSegment.length === 36 && lastSegment.includes("-")) {
			// Already in UUID format
			return lastSegment;
		}

		return null;
	} catch {
		return null;
	}
}

/**
 * Fetches content from a Notion page using the Notion API.
 */
async function fetchNotionContent(
	pageId: string,
	notion: any,
): Promise<string> {
	try {
		// Fetch the page
		const page = await notion.pages.retrieve({ page_id: pageId });

		// Fetch all blocks from the page
		const blocks = await notion.blocks.children.list({
			block_id: pageId,
		});

		// Extract text from blocks recursively
		const extractTextFromBlocks = async (
			blockList: any[],
		): Promise<string> => {
			let text = "";

			for (const block of blockList) {
				// Extract text based on block type
				if (block.type === "paragraph" && block.paragraph) {
					text += extractRichText(block.paragraph.rich_text) + "\n\n";
				} else if (block.type === "heading_1" && block.heading_1) {
					text += extractRichText(block.heading_1.rich_text) + "\n\n";
				} else if (block.type === "heading_2" && block.heading_2) {
					text += extractRichText(block.heading_2.rich_text) + "\n\n";
				} else if (block.type === "heading_3" && block.heading_3) {
					text += extractRichText(block.heading_3.rich_text) + "\n\n";
				} else if (block.type === "bulleted_list_item" && block.bulleted_list_item) {
					text += "• " + extractRichText(block.bulleted_list_item.rich_text) + "\n";
				} else if (block.type === "numbered_list_item" && block.numbered_list_item) {
					text += "• " + extractRichText(block.numbered_list_item.rich_text) + "\n";
				} else if (block.type === "quote" && block.quote) {
					text += "> " + extractRichText(block.quote.rich_text) + "\n\n";
				} else if (block.type === "code" && block.code) {
					text += extractRichText(block.code.rich_text) + "\n\n";
				} else if (block.type === "callout" && block.callout) {
					text += extractRichText(block.callout.rich_text) + "\n\n";
				}

				// Recursively fetch child blocks
				if (block.has_children) {
					const childBlocks = await notion.blocks.children.list({
						block_id: block.id,
					});
					text += await extractTextFromBlocks(childBlocks.results);
				}
			}

			return text;
		};

		// Get page title if available
		let title = "";
		if (page.properties) {
			for (const [key, prop] of Object.entries(page.properties)) {
				if ((prop as any).type === "title" && (prop as any).title) {
					title = extractRichText((prop as any).title);
					break;
				}
			}
		}

		const content = await extractTextFromBlocks(blocks.results);
		return title ? `${title}\n\n${content}` : content;
	} catch (error) {
		throw new Error(
			`Failed to fetch Notion page: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Extracts plain text from Notion rich text array.
 */
function extractRichText(richText: any[]): string {
	if (!richText || !Array.isArray(richText)) {
		return "";
	}
	return richText.map((text) => text.plain_text || "").join("");
}

/**
 * Fetches content from an external URL.
 */
async function fetchExternalContent(url: string): Promise<string> {
	try {
		const response = await fetch(url, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
			},
		});

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const html = await response.text();

		// Simple HTML text extraction
		// Remove script and style tags
		let text = html
			.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
			.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

		// Extract text from common content tags
		const contentTags = [
			/<h1[^>]*>(.*?)<\/h1>/gi,
			/<h2[^>]*>(.*?)<\/h2>/gi,
			/<h3[^>]*>(.*?)<\/h3>/gi,
			/<h4[^>]*>(.*?)<\/h4>/gi,
			/<p[^>]*>(.*?)<\/p>/gi,
			/<li[^>]*>(.*?)<\/li>/gi,
			/<article[^>]*>(.*?)<\/article>/gi,
			/<main[^>]*>(.*?)<\/main>/gi,
			/<section[^>]*>(.*?)<\/section>/gi,
		];

		let extractedText = "";
		for (const tagRegex of contentTags) {
			const matches = text.matchAll(tagRegex);
			for (const match of matches) {
				if (match[1]) {
					// Remove HTML tags from the content
					const cleanText = match[1]
						.replace(/<[^>]+>/g, " ")
						.replace(/\s+/g, " ")
						.trim();
					if (cleanText.length > 10) {
						// Only include substantial text
						extractedText += cleanText + "\n\n";
					}
				}
			}
		}

		// Fallback: extract all text if no structured content found
		if (extractedText.trim().length < 100) {
			extractedText = text
				.replace(/<[^>]+>/g, " ")
				.replace(/\s+/g, " ")
				.trim();
		}

		// Limit content length to avoid token limits
		return extractedText.slice(0, 50000);
	} catch (error) {
		throw new Error(
			`Failed to fetch external URL: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Generates an AI summary using Notion's AI blocks.
 * Creates a temporary page, adds content and an AI block, waits for completion,
 * retrieves the summary, then cleans up the temporary page.
 */
async function generateSummary(
	content: string,
	notion: any,
	parentPageId?: string,
): Promise<string> {
	try {
		// Get the parent database/page ID - use a default workspace page if not provided
		// For now, we'll need the parentPageId to be provided, or we can list databases
		if (!parentPageId) {
			// Try to get the first available page/database
			// This is a limitation - in practice, you'd want to pass a parent page ID
			throw new Error(
				"Parent page ID is required to create AI summary. Please provide a Notion page ID where the summary can be generated.",
			);
		}

		// Create a temporary page for the AI summary
		const tempPage = await notion.pages.create({
			parent: { page_id: parentPageId },
			properties: {
				title: {
					title: [
						{
							text: {
								content: "Temporary Summary Page",
							},
						},
					],
				},
			},
		});

		const tempPageId = tempPage.id;

		try {
			// Add the content as a paragraph block
			await notion.blocks.children.append({
				block_id: tempPageId,
				children: [
					{
						type: "paragraph",
						paragraph: {
							rich_text: [
								{
									text: {
										content: content.slice(0, 20000), // Limit content size
									},
								},
							],
						},
					},
				],
			});

			// Create an AI block with a prompt to generate a summary
			const aiBlockResponse = await notion.blocks.children.append({
				block_id: tempPageId,
				children: [
					{
						type: "ai_block",
						ai_block: {
							prompt:
								"Please provide a concise summary (2-3 paragraphs) of the content above. Capture the key points and main ideas.",
						},
					},
				],
			});

			const aiBlockId = aiBlockResponse.results[0]?.id;
			if (!aiBlockId) {
				throw new Error("Failed to create AI block");
			}

			// Poll for AI block completion (AI blocks process asynchronously)
			let summary = "";
			const maxAttempts = 30; // 30 seconds max wait
			for (let attempt = 0; attempt < maxAttempts; attempt++) {
				await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second

				const block = await notion.blocks.retrieve({
					block_id: aiBlockId,
				});

				// Check if AI block has completed and has content
				if (block.type === "ai_block" && block.ai_block) {
					// The AI block should have children with the generated content
					const children = await notion.blocks.children.list({
						block_id: aiBlockId,
					});

					if (children.results.length > 0) {
						// Extract text from the AI-generated blocks
						for (const childBlock of children.results) {
							if (childBlock.type === "paragraph" && childBlock.paragraph) {
								summary += extractRichText(childBlock.paragraph.rich_text) + "\n\n";
							} else if (
								childBlock.type === "heading_1" &&
								childBlock.heading_1
							) {
								summary += extractRichText(childBlock.heading_1.rich_text) + "\n\n";
							} else if (
								childBlock.type === "heading_2" &&
								childBlock.heading_2
							) {
								summary += extractRichText(childBlock.heading_2.rich_text) + "\n\n";
							} else if (
								childBlock.type === "heading_3" &&
								childBlock.heading_3
							) {
								summary += extractRichText(childBlock.heading_3.rich_text) + "\n\n";
							}
						}

						if (summary.trim().length > 0) {
							break; // Summary is ready
						}
					}
				}
			}

			if (!summary || summary.trim().length === 0) {
				throw new Error(
					"AI summary generation timed out or failed to produce content",
				);
			}

			return summary.trim();
		} finally {
			// Clean up: archive (delete) the temporary page
			try {
				await notion.pages.update({
					page_id: tempPageId,
					archived: true,
				});
			} catch (cleanupError) {
				// Log but don't fail if cleanup fails
				console.error("Failed to clean up temporary page:", cleanupError);
			}
		}
	} catch (error) {
		throw new Error(
			`Failed to generate summary using Notion AI: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

// Define input schema
const inputSchema: JSONSchemaType<{ url: string; parentPageId?: string }> = {
	type: "object",
	properties: {
		url: {
			type: "string",
			description: "The URL of the page to summarize (Notion page or external URL)",
		},
		parentPageId: {
			type: "string",
			nullable: true,
			description:
				"Optional: Notion page ID to use as parent for temporary summary page (required for external URLs)",
		},
	},
	required: ["url"],
	additionalProperties: false,
};

// Define output schema
const outputSchema: JSONSchemaType<{ summary: string }> = {
	type: "object",
	properties: {
		summary: {
			type: "string",
			description: "A concise AI-generated summary (2-3 paragraphs)",
		},
	},
	required: ["summary"],
	additionalProperties: false,
};

// Register the tool
worker.tool<{ url: string; parentPageId?: string }, { summary: string }>(
	"summarizePage",
	{
		title: "Summarize Page",
		description:
			"Takes a URL as input, fetches the page content, and returns a concise AI-generated summary (2-3 paragraphs). Supports Notion pages and external URLs (articles, blog posts, documentation pages).",
		schema: inputSchema,
		outputSchema: outputSchema,
		execute: async (input, context) => {
			const { url, parentPageId } = input;
			const { notion } = context;

			// Validate URL
			try {
				new URL(url);
			} catch {
				throw new Error(`Invalid URL: ${url}`);
			}

			// Determine if it's a Notion URL or external URL
			const notionPageId = extractNotionPageId(url);

			let content: string;
			let pageIdForParent: string | undefined;

			if (notionPageId) {
				// Fetch from Notion API
				content = await fetchNotionContent(notionPageId, notion);
				// Use the Notion page itself as parent if no parentPageId provided
				pageIdForParent = parentPageId || notionPageId;
			} else {
				// Fetch from external URL
				content = await fetchExternalContent(url);
				// For external URLs, parentPageId is required
				if (!parentPageId) {
					throw new Error(
						"parentPageId is required for external URLs. Please provide a Notion page ID to use as parent for the temporary summary page.",
					);
				}
				pageIdForParent = parentPageId;
			}

			if (!content || content.trim().length < 50) {
				throw new Error(
					"Unable to extract sufficient content from the page. The page may be empty, require authentication, or have a format that cannot be parsed.",
				);
			}

			// Generate AI summary using Notion's AI blocks
			const summary = await generateSummary(content, notion, pageIdForParent);

			return { summary };
		},
	},
);
