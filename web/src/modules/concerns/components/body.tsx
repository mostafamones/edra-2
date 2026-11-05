/** Text stays text. Only explicit HTTP(S) URLs become links; no HTML or metadata is fetched. */
export function ConcernBody({ body }: { body: string }) {
  return <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]" dir="auto">{body.split(/(https?:\/\/[^\s<>]+)/gi).map((part, index) => /^https?:\/\//i.test(part)
    ? <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{part}</a> : part)}</p>;
}
