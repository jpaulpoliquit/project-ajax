import { Client } from "@notionhq/client";
export type CapabilityContext = {
    /** Notion API SDK client for this execution. */
    notion: Client;
};
export declare function createCapabilityContext(): CapabilityContext;
//# sourceMappingURL=context.d.ts.map