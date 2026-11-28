/** Private Worker binding. Only the Edra Worker can send requests to this object. */
export interface Grant {
  academyId: string;
  sealedSession: number[];
  resource: string;
  scope: string;
  sessionExpires: number;
  challenge: string;
  redirectUri: string;
  codeHash: string;
  codeExpires: number;
  accessHash?: string;
}

export interface GrantNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}

interface Storage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: Grant): Promise<void>;
  delete(key: string): Promise<boolean>;
  setAlarm(time: number): Promise<void>;
  transaction<T>(callback: (transaction: Pick<Storage, "get" | "put" | "delete" | "setAlarm">) => Promise<T>): Promise<T>;
}

export class McpGrantStore {
  constructor(private readonly state: { storage: Storage }) {}

  async fetch(request: Request) {
    const input = await request.json() as { grant?: Grant; hash?: string; challenge?: string; resource?: string; redirectUri?: string; accessHash?: string };
    return this.state.storage.transaction(async tx => {
      const grant = await tx.get<Grant>("grant");
      const now = Date.now();
      switch (new URL(request.url).pathname) {
        case "/create": {
          if (grant || !input.grant) break;
          await tx.put("grant", input.grant);
          await tx.setAlarm(input.grant.codeExpires);
          return new Response(null, { status: 204 });
        }
        case "/exchange": {
          if (!grant || grant.accessHash || grant.codeExpires <= now || grant.sessionExpires <= now + 1000
            || grant.resource !== input.resource || grant.codeHash !== input.hash || grant.challenge !== input.challenge || grant.redirectUri !== input.redirectUri || !input.accessHash) break;
          await tx.put("grant", { ...grant, accessHash: input.accessHash, codeHash: "" });
          await tx.setAlarm(grant.sessionExpires);
          return Response.json({ expiresIn: Math.floor((grant.sessionExpires - now) / 1000) });
        }
        case "/read": {
          if (!grant?.accessHash || grant.sessionExpires <= now || grant.accessHash !== input.hash) break;
          return Response.json({ academyId: grant.academyId, sealedSession: grant.sealedSession, resource: grant.resource, scope: grant.scope });
        }
        case "/revoke": {
          if (grant?.accessHash && grant.accessHash === input.hash) await tx.delete("grant");
          return new Response(null, { status: 204 });
        }
      }
      return new Response(null, { status: 404 });
    });
  }

  async alarm() {
    await this.state.storage.transaction(async tx => {
      const grant = await tx.get<Grant>("grant");
      if (!grant) return;
      const expires = grant.accessHash ? grant.sessionExpires : grant.codeExpires;
      if (expires <= Date.now()) await tx.delete("grant");
      else await tx.setAlarm(expires);
    });
  }
}
