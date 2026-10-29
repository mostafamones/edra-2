"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { changeOnlineSetting, loadOnlineSetting } from "../../actions";

/** Manager control: whether in-person students may submit assignments online (off by default). */
export function InPersonOnlineSetting({ academyId }: { academyId: string }) {
  const client = useQueryClient();
  const key = ["assignments", academyId, "online-setting"];
  const query = useQuery({ queryKey: key, queryFn: async () => {
    const result = await loadOnlineSetting(academyId);
    if (!result.ok) throw new Error(result.message);
    return result;
  } });
  async function change(enabled: boolean) {
    if (!query.data) return;
    const result = await changeOnlineSetting({ academyId, enabled, version: query.data.version });
    if (!result.ok) toast.error(result.message);
    await client.invalidateQueries({ queryKey: key });
  }
  return (
    <Field orientation="horizontal" className="w-auto">
      <Switch id="in-person-online" checked={query.data?.enabled ?? false} disabled={!query.data} onCheckedChange={(value) => void change(value)} />
      <FieldLabel htmlFor="in-person-online">Online assignment submission for in-person students</FieldLabel>
    </Field>
  );
}
