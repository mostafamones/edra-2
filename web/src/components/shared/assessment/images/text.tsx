"use client";

import { useState } from "react";

import { ImageBadge } from "./badge";
import { imageIds, splitImages } from "./tokens";
import { ImageViewer } from "./viewer";

/** Stored question text or a choice, read-only: images show as chips that preview on hover and open the viewer. */
export function RichText({ value }: { value: string }) {
  const [viewing, setViewing] = useState<number | null>(null);
  const segments = splitImages(value);
  let position = 0;
  return (
    <>
      {segments.map((segment, index) => {
        if (segment.type === "text") return <span key={index}>{segment.text}</span>;
        const number = position++;
        return <ImageBadge key={`${segment.id}-${index}`} id={segment.id} number={number + 1} onOpen={() => setViewing(number)} />;
      })}
      {position > 0 && <ImageViewer ids={imageIds(value)} index={viewing} onIndexChange={setViewing} />}
    </>
  );
}
