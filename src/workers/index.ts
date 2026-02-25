/**
 * Worker registration index
 * Each worker module exports a register function. Import and call from main index.
 */

export { registerSummarizeTool } from "./summarize.js";
export { registerTelegramTools } from "./telegram/index.js";
