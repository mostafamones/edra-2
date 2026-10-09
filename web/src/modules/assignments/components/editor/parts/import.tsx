"use client";

import { useRef } from "react";
import { toast } from "sonner";
import { IconFileImport } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { isValidMaxScore } from "../../../score";
import { MAX_CHOICES, MAX_QUESTIONS, type FormPart } from "../../../validation";

type Question = FormPart["questions"][number];
type Raw = { prompt?: unknown; question?: unknown; marks?: unknown; maxScore?: unknown; choices?: unknown; answer?: unknown };

/** Development only: fills an online-questions part from a JSON file of `{ prompt, marks, choices, answer }`. */
export function JsonImport({ onImport }: { onImport: (questions: Question[]) => void }) {
  const input = useRef<HTMLInputElement>(null);

  async function load(file: File) {
    try {
      const data: unknown = JSON.parse(await file.text());
      const list = (Array.isArray(data) ? data : (data as { questions?: unknown }).questions) as Raw[];
      if (!Array.isArray(list)) throw new Error("Expected an array of questions.");
      const questions = list.slice(0, MAX_QUESTIONS).map((raw): Question => {
        const choices = (Array.isArray(raw.choices) ? raw.choices : []).slice(0, MAX_CHOICES).map((choice) => String(typeof choice === "object" && choice ? (choice as { label?: unknown }).label ?? "" : choice));
        const answer = typeof raw.answer === "string" ? raw.answer.toUpperCase().charCodeAt(0) - 65 : Number(raw.answer);
        const marks = String(raw.marks ?? raw.maxScore ?? "1");
        return {
          prompt: String(raw.prompt ?? raw.question ?? ""),
          maxScore: isValidMaxScore(marks) ? marks : "1",
          choices: choices.map((label, index) => ({ label, isCorrect: index === answer })),
        };
      });
      onImport(questions);
      toast.success(`Imported ${questions.length} questions.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn’t read that file.");
    }
  }

  return (
    <>
      <input ref={input} type="file" accept="application/json,.json" className="hidden"
        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void load(file); }} />
      <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
        <IconFileImport />Import JSON
      </Button>
    </>
  );
}
