declare module "cloudflare:workers" {
  export const env: { EDRA_MCP_GRANTS?: import("./grants").GrantNamespace };
}
