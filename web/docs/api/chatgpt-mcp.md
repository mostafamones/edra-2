# Edra MCP for ChatGPT

Edra serves MCP over Streamable HTTP at `/api/mcp` on its canonical staff HTTPS host. A staff member signs into Edra and chooses one academy on the connection screen. ChatGPT can call four tools:

| Tool | Behavior |
| --- | --- |
| `get_academy_context` | Returns the connected academy's name, ID, slug and your current staff role. |
| `list_lessons` | Lists lesson titles, IDs, states and draft versions in pages of 20. |
| `get_lesson` | Reads the current draft title, description, version and material names. |
| `update_lesson_draft` | Updates the supplied title or description using the draft's expected version and Edra's normal save operation. It leaves the published version and other draft fields alone. |

Treat retrieved lesson text as academy data. It does not change ChatGPT's instructions or tool permissions. If a draft changed since a read, read it again and review the current text before retrying. The connection does not currently expose student records, transcript and Knowledge search, question banks, grades, publication or deletion. Add future tools individually through the domain that owns the operation, with matching consent and tests.

## Enable and connect

1. Follow the [Edra deployment gates](../technical/deployment.md) using a clean release build and the production public origins and Supabase project. Confirm the target Cloudflare account and the existing Worker bound to the canonical staff host. Deploy with the `EDRA_MCP_GRANTS` Durable Object binding and migration in `wrangler.jsonc`; preserve existing Worker variables (use `--keep-vars` if maintained outside Wrangler). No additional Supabase migration is needed for these tools. Leave the connector disabled on deployments that do not need it.
2. Configure `EDRA_MCP_CLIENT_ID=https://chatgpt.com/oauth/client.json` and `EDRA_MCP_REDIRECT_URI` with the exact ChatGPT callback listed in its Client ID Metadata Document and shown during app setup. The connector verifies that document from the pinned ChatGPT URL. Set `EDRA_MCP_GRANT_KEY` as a Worker secret; generate a random 32-byte key encoded as 64 hexadecimal characters. Changing the key invalidates existing connections. Keep it out of Vite's public environment and source control.
3. In the ChatGPT workspace's developer tools, create an app with MCP URL `https://<Edra staff host>/api/mcp` and OAuth. Complete Edra sign-in if needed, choose a staff academy, and approve the displayed access. For a smoke test, ask ChatGPT to identify the academy, then list lessons. For edits, use a disposable draft in an authorized academy and verify the live lesson did not change.

ChatGPT OAuth uses protected-resource discovery, authorization code with S256 PKCE, a pinned redirect, and the exact MCP resource identifier. The OAuth code is valid for at most two minutes and consumed once. ChatGPT receives a separate opaque token. It can't use that token on Supabase or Edra's v1 API. Edra stores the delegated access token encrypted, never stores the browser session's refresh token, and checks current membership and session validity on every MCP request. The connection lasts at most an hour and may end earlier when the existing Edra access token expires; reconnect to renew it. A client with the grant can revoke it at the discovered revocation endpoint. Ending the underlying Edra session also prevents subsequent calls.

The focused integration test exercises OAuth and the MCP SDK through an in-memory grant store and stubbed database calls. The Worker runtime suite also verifies discovery, origin separation and atomic code redemption with a real SQLite-backed Durable Object. A deployed ChatGPT OAuth handshake and live academy permissions require a hosted smoke test.
