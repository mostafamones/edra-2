import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { loadMcpConsent } from "../-functions/mcp";

export const Route = createFileRoute("/auth/chatgpt")({
  loaderDeps: ({ search }) => search,
  loader: async ({ location }) => {
    const result = await loadMcpConsent({ data: { query: location.searchStr } });
    if (result.status === "sign-in") throw redirect({ to: "/auth/login", search: { next: location.pathname + location.searchStr } });
    return result;
  },
  head: () => ({ meta: [{ title: "Connect ChatGPT · Edra" }, { name: "referrer", content: "no-referrer" }, { name: "robots", content: "noindex" }] }),
  component: Consent,
});

function Consent() {
  const result = Route.useLoaderData();
  const [academy, setAcademy] = useState("");
  return <section>
    <h1 className="text-2xl font-semibold">Connect ChatGPT</h1>
    {result.status === "ready" ? <form className="mt-6 space-y-5" action="/api/mcp/authorize" method="post">
      {result.fields.map(([key, value]) => <input key={key} name={key} type="hidden" value={value} />)}
      <div className="space-y-2">
        <Label htmlFor="mcp-academy">Academy</Label>
        <Select name="academy_id" value={academy} onValueChange={setAcademy}>
          <SelectTrigger id="mcp-academy" className="w-full" disabled={!result.academies.length}><SelectValue placeholder="Select academy" /></SelectTrigger>
          <SelectContent>{result.academies.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {result.academies.length ? <ul className="list-disc space-y-1 pl-5 text-sm">
        <li>Read academy and lesson information</li><li>Edit lesson draft titles and descriptions using your staff permissions</li>
      </ul> : <p role="status">No staff academies available.</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" name="decision" value="deny" type="submit">Decline</Button>
        <Button name="decision" value="allow" type="submit" disabled={!academy}>Connect</Button>
      </div>
    </form> : <p role="alert" className="mt-4">{result.status === "invalid" ? "This ChatGPT connection request is invalid." : "ChatGPT connections are unavailable."}</p>}
  </section>;
}
