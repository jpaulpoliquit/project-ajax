/**
 * Telegram Bot API client
 */

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";

export function getBotToken(): string {
	const token = process.env.TELEGRAM_BOT_TOKEN;
	if (!token) {
		throw new Error(
			"TELEGRAM_BOT_TOKEN environment variable is required. Get a token from @BotFather on Telegram.",
		);
	}
	return token;
}

/**
 * Returns the history bot token for getUpdates when the main bot has webhook active.
 * Create a second bot via @BotFather, add it to the same groups, and set TELEGRAM_HISTORY_BOT_TOKEN.
 * The history bot must NOT have a webhook set.
 */
export function getHistoryBotToken(): string {
	const token = process.env.TELEGRAM_HISTORY_BOT_TOKEN;
	if (!token) {
		throw new Error(
			"TELEGRAM_HISTORY_BOT_TOKEN is required for reading message history while webhook is active. " +
				"Create a second bot via @BotFather, add it to the same groups as the main bot, and set this env var. " +
				"Do NOT set a webhook on the history bot.",
		);
	}
	return token;
}

export async function telegramApi<T>(
	token: string,
	method: string,
	params?: Record<string, unknown>,
): Promise<T> {
	const url = `${TELEGRAM_API_BASE}${token}/${method}`;
	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: params ? JSON.stringify(params) : undefined,
	});
	if (!response.ok) {
		const err = await response.text();
		throw new Error(`Telegram API error: ${response.status} - ${err}`);
	}
	const data = (await response.json()) as { ok: boolean; result?: T; description?: string };
	if (!data.ok) {
		throw new Error(data.description || "Telegram API returned ok: false");
	}
	return data.result as T;
}

export function getFileDownloadUrl(token: string, filePath: string): string {
	return `https://api.telegram.org/file/bot${token}/${filePath}`;
}
