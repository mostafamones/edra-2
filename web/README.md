# Edra web

Next.js staff/student application and the modular backend using cloud Supabase. Native clients use its authenticated HTTP API.

## Development

From web/, install the locked dependencies with npm ci, copy .env.example to .env.local, set the configured cloud project's public values and development origins, then run npm run dev. Keep secrets server-side. No local database is required.

Development hosts use lvh.me, app.lvh.me and learn.lvh.me on port 3000; see [routing](docs/technical/routing.md). Check available commands in package.json. test:db currently starts/resets local Supabase and is not the default cloud-check path.

## References

- [Documentation index](docs/README.md).
- [Engineering](docs/engineering.md), [current API](docs/api/README.md), [deployment](docs/technical/deployment.md).
- [Native app](../mobile/README.md).

Source/API documentation does not establish deployment readiness. Follow AGENTS.md and keep application implementation separate from Master-thread planning.
