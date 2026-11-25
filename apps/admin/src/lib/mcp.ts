import "server-only";
import type { McpAuthOptions } from "@clerk/mcp-tools/next";

/**
 * Public URLs of the staff MCP endpoint. Claude asks Clerk for a token bound
 * to one of these (the OAuth `resource`), and every request is checked against
 * them. Set MCP_RESOURCE_URLS (comma separated) to add domains.
 */
const DEFAULT_URLS = [
  "https://petwealth-admin.perfectlaunch.ai/api/mcp",
  "https://admin-v2.petwealth.com/api/mcp",
  "https://admin.petwealth.com/api/mcp",
];

export const mcpResourceUrls: string[] = process.env.MCP_RESOURCE_URLS
  ? process.env.MCP_RESOURCE_URLS.split(",").map((u) => u.trim()).filter(Boolean)
  : process.env.NODE_ENV === "development"
    ? ["http://localhost:3001/api/mcp", "http://localhost:3011/api/mcp"]
    : DEFAULT_URLS;

export const mcpAuthOptions = {
  resourceUrl: mcpResourceUrls,
  requiredScopes: ["profile", "email"],
} satisfies McpAuthOptions;
