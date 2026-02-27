type NotionDatabaseProperty = {
	type?: string;
	status?: {
		options?: { name: string }[];
	};
};

type NotionPropertyMap = Record<string, NotionDatabaseProperty>;

export type TelegramNotionSchema = {
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
	if (!properties || typeof properties !== "object") return null;
	for (const [name, prop] of Object.entries(properties)) {
		if (prop?.type !== type) continue;
		if (wanted.has(normalizeName(name))) return name;
	}
	return null;
}

export function resolveTelegramNotionSchema(
	properties: NotionPropertyMap | null | undefined,
): TelegramNotionSchema | null {
	if (!properties || typeof properties !== "object") return null;

	let titleProp = "Name";
	let statusProp: string | null = null;
	let statusNotStarted: string | null = null;

	for (const [name, prop] of Object.entries(properties)) {
		const type = prop?.type;
		if (type === "title") {
			titleProp = name;
		} else if (type === "status") {
			statusProp = name;
			const options = prop?.status?.options;
			const notStarted = options?.find((option) => /not\s*started/i.test(option.name));
			statusNotStarted = notStarted?.name ?? options?.[0]?.name ?? null;
		}
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

type NotionFailureClass =
	| "schema_unavailable"
	| "object_not_found"
	| "unauthorized"
	| "rate_limited"
	| "request_timeout"
	| "validation_error"
	| "conflict_error"
	| "api_response_error"
	| "unknown";

function getErrorCode(error: unknown): string | undefined {
	if (error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string") {
		return (error as { code: string }).code;
	}
	return undefined;
}

function classifyNotionFailure(error: unknown): NotionFailureClass {
	const code = getErrorCode(error);
	switch (code) {
		case "object_not_found":
			return "object_not_found";
		case "unauthorized":
		case "restricted_resource":
			return "unauthorized";
		case "rate_limited":
			return "rate_limited";
		case "validation_error":
			return "validation_error";
		case "conflict_error":
			return "conflict_error";
		case "request_timeout":
			return "request_timeout";
	}

	if (error instanceof Error) {
		if (/no properties/i.test(error.message)) return "schema_unavailable";
	}

	if (code) return "api_response_error";
	return "unknown";
}

export function logNotionFailure(
	event: string,
	error: unknown,
	context: Record<string, unknown>,
): void {
	const code = getErrorCode(error) ?? null;
	const message = error instanceof Error ? error.message : String(error);
	console.error(event, {
		failure_class: classifyNotionFailure(error),
		notion_error_code: code,
		message,
		...context,
	});
}
