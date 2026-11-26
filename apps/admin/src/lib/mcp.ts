import "server-only";
import type { McpAuthOptions } from "@clerk/mcp-tools/next";

/**
 * Public URLs of the staff MCP endpoint. Claude asks Clerk for a token bound
 * to one of these (the OAuth `resource`), and every request is checked against
 * them. Set MCP_RESOURCE_URLS (comma separated) to add domains.
 */
// The first one is the main address: links the assistant returns use it.
const DEFAULT_URLS = [
  "https://admin-v2.petwealth.com/api/mcp",
  "https://admin.petwealth.com/api/mcp",
  "https://petwealth-admin.perfectlaunch.ai/api/mcp",
];

export const mcpResourceUrls: string[] = process.env.MCP_RESOURCE_URLS
  ? process.env.MCP_RESOURCE_URLS.split(",").map((u) => u.trim()).filter(Boolean)
  : process.env.NODE_ENV === "development"
    ? ["http://localhost:3001/api/mcp", "http://localhost:3011/api/mcp"]
    : DEFAULT_URLS;

export const mcpAuthOptions = {
  resourceUrl: mcpResourceUrls,
  requiredScopes: ["profile", "email"],
  // Every request needs a staff token, even listing tools, so Claude asks the
  // user to sign in as soon as they connect instead of after the first call.
  discoverable: false,
} satisfies McpAuthOptions;
