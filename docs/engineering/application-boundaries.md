# Application boundaries

web/ owns the Next.js application and modular backend using cloud Supabase. mobile/ owns native applications. Each keeps its own dependencies, build, tests and release process.

Backend domain services own academic rules. HTTP routes adapt authenticated requests to those services. Native apps use Supabase Auth and Edra's HTTP API; they do not import web server code, write attendance tables directly or create a second backend.

Clients collect input and present results. Trusted backend/database checks enforce academy authority, role permissions, constraints and history. Account identity, academy profile, annual participation and learning access remain distinct. Caches are not authoritative records; retries preserve logical operation identity.

Provider/backend secrets stay off clients. Brand identity has one [shared source](brand.md); each platform implements it with its own UI foundations. Ordinary app icons use Tabler; brand logos follow the official assets and colors described in the shared brand reference. Multiple apps do not by themselves justify a root toolchain, shared runtime package or backend extraction.
