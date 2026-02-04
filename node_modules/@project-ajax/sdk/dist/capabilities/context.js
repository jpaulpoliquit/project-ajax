import { Client } from "@notionhq/client";
function createCapabilityContext() {
  const options = {};
  if (process.env.NOTION_API_BASE_URL) {
    options.baseUrl = process.env.NOTION_API_BASE_URL;
  }
  if (process.env.NOTION_API_TOKEN) {
    options.auth = process.env.NOTION_API_TOKEN;
  }
  const notion = new Client(options);
  return { notion };
}
export {
  createCapabilityContext
};
