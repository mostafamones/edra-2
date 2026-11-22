import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { pageSize } from "./bank-contract";
import { bankPageOptions, type BankScope } from "./queries";

function useDebounced(value: string, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Server-side search, collection filter and pagination shared by the library and the assessment picker. */
export function useBankBrowse(scope: BankScope) {
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [offset, setOffset] = useState(0);
  const query = useDebounced(text.trim());
  // A changed filter starts again at the first page, including when the debounced search lands.
  const [settled, setSettled] = useState(query);
  if (settled !== query) { setSettled(query); setOffset(0); }
  const page = useQuery(bankPageOptions(scope, { collectionId, query, offset }));
  const total = page.data?.total ?? 0;
  return {
    page, text, query, collectionId, offset, total,
    filtered: !!query || !!collectionId,
    setText,
    setCollection: (id: string | null) => { setCollectionId(id); setOffset(0); },
    clear: () => { setText(""); setCollectionId(null); setOffset(0); },
    previous: offset > 0 ? () => setOffset(Math.max(0, offset - pageSize)) : undefined,
    next: offset + pageSize < total ? () => setOffset(offset + pageSize) : undefined,
    range: total ? `${offset + 1}–${Math.min(offset + pageSize, total)} of ${total}` : "",
  };
}
