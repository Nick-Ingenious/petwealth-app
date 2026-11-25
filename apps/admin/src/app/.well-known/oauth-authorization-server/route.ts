import { authorizationServerMetadataHandler, metadataCorsHandler } from "@clerk/mcp-tools/next";

/** Clerk's OAuth server metadata, for MCP clients that look for it on this origin. */
const handler = authorizationServerMetadataHandler();
const corsHandler = metadataCorsHandler();

export { handler as GET, corsHandler as OPTIONS };
