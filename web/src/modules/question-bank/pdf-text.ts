type TextLayerItem = {
  str: string;
  hasEOL: boolean;
  transform: number[];
  height: number;
} | { type: string };

export function readTextLayer(items: TextLayerItem[], position: (item: Extract<TextLayerItem, { str: string }>) => number | null) {
  const lines: string[] = [];
  const lineTops: (number | null)[] = [];
  let text = "";
  let top: number | null = null;
  function finishLine() {
    lines.push(text.trimEnd());
    lineTops.push(top);
    text = "";
    top = null;
  }
  for (const item of items) {
    if (!("str" in item)) continue;
    if (!text.trim() && item.str.trim()) top = position(item);
    text += item.str + " ";
    if (item.hasEOL) finishLine();
  }
  if (text.trim()) finishLine();
  return { text: lines.join("\n"), lineTops };
}
