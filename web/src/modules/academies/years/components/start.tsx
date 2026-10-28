"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { SettingsGroup } from "@/components/shared/settings-group";
import { SettingsRow as Row } from "@/components/shared/settings-row";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AcademyGate } from "@/modules/auth";

import { getYearLearning, startYearLearning } from "../actions";
import type { YearLearning } from "../types";

/** Academic year → student learning: managers start the open year; other staff see its state. */
export function YearLearningSettings() {
  return <AcademyGate>{(academy) => <YearLearningRow academyId={academy.id} />}</AcademyGate>;
}

function YearLearningRow({ academyId }: { academyId: string }) {
  const queryClient = useQueryClient();
  const key = ["year-learning", academyId] as const;
  const [confirm, setConfirm] = useState(false);
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const result = await getYearLearning(academyId);
      if (!result.ok) throw new Error(result.error);
      return result.value;
    },
  });
  const start = useMutation({
    mutationFn: async (yearId: string) => {
      const result = await startYearLearning(academyId, yearId);
      if (!result.ok) throw new Error(result.error);
      return result.value;
    },
    onSuccess: (value) => {
      queryClient.setQueryData<YearLearning>(key, value);
      toast.success("Student learning started");
    },
    onError: (error) => toast.error(error.message === "forbidden" ? "You don’t have permission to do that." : "Couldn’t start the year. Try again."),
  });

  if (query.isPending) return <Skeleton className="h-16 w-full" />;
  if (query.isError || !query.data.year) return null;
  const { year, canManage } = query.data;
  const label = `${year.startYear}–${year.startYear + 1}`;
  return (
    <SettingsGroup title="Academic year">
      <Row id="year-learning" title={`Student learning ${label}`}>
        {year.startedAt
          ? <Badge>Started</Badge>
          : canManage
            ? <Button type="button" size="sm" disabled={start.isPending} onClick={() => setConfirm(true)}>Start year</Button>
            : <Badge variant="secondary">Not started</Badge>}
      </Row>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start {label}?</AlertDialogTitle>
            <AlertDialogDescription>Students in this year can use learning material and assessments. This can’t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => start.mutate(year.id)}>Start year</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsGroup>
  );
}
