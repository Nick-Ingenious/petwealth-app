import { metadataCorsHandler, protectedResourceMetadataHandler } from "@clerk/mcp-tools/next";
import { mcpAuthOptions } from "@/lib/mcp";

/** Tells MCP clients (Claude) that the staff MCP endpoint is protected by Clerk OAuth. */
const handler = protectedResourceMetadataHandler(mcpAuthOptions);
const corsHandler = metadataCorsHandler();

export { handler as GET, corsHandler as OPTIONS };
