import { choiceKey } from "./parser";

type Word = { text: string; x: number; baseline: number; width: number; height: number };
type Choice = { key: string; text: string };
export type MarkedChoices = { choices: Choice[]; markedKeys: string[] };
const label = /^\s*(?:\(([a-dأابجد])\)|([a-dأابجد])[.)])(?:\s+|$)/iu;
const fingerprint = (text: string) => text.normalize("NFKC").toLowerCase().replace(/\^(?=\d)|\s/gu, "");

export function readMarkedChoices(words: Word[], isHighlighted: (word: Word) => boolean): MarkedChoices[] {
  const labels = words.flatMap(word => {
    const match = label.exec(word.text);
    return match ? [{ word, key: choiceKey(match[1] ?? match[2]), rest: word.text.slice(match[0].length) }] : [];
  });
  const groups: MarkedChoices[] = [];
  for (let i = 0; i <= labels.length - 4; i++) {
    const group = labels.slice(i, i + 4);
    if (group.map(item => item.key).join("") !== "ABCD") continue;
    const options = group.map(({ word, key, rest }) => {
      const right = Math.min(...labels.filter(item => item.word.x > word.x &&
        Math.abs(item.word.baseline - word.baseline) < word.height * 0.2).map(item => item.word.x));
      const fragments = words.filter(item => item.x >= word.x + word.width - 0.5 && item.x < right &&
        Math.abs(item.baseline - word.baseline) < word.height * 0.42 && !label.test(item.text))
        .sort((a, b) => a.x - b.x);
      const text = [rest, ...fragments.map(item => item.text)].join(" ").trim();
      return { key, text, marked: [word, ...fragments].some(isHighlighted) };
    });
    const markedKeys = options.filter(option => option.marked).map(option => option.key);
    if (options.every(option => option.text)) {
      groups.push({ choices: options.map(({ key, text }) => ({ key, text })), markedKeys });
    }
    i += 3;
  }
  return groups;
}

export function isYellowHighlight(ctx: CanvasRenderingContext2D, word: Word) {
  const x = Math.max(0, Math.floor(word.x));
  const y = Math.max(0, Math.floor(word.baseline - word.height * 0.8));
  const width = Math.min(ctx.canvas.width - x, Math.ceil(word.width));
  const height = Math.min(ctx.canvas.height - y, Math.ceil(word.height));
  if (width < 2 || height < 2) return false;
  const { data } = ctx.getImageData(x, y, width, height);
  let yellow = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 180 && data[i + 1] > 170 && data[i + 2] < 140 && data[i + 1] - data[i + 2] > 70) yellow++;
  }
  return yellow >= width * height * 0.32;
}

export function findPrintedMarks(groups: MarkedChoices[], choices: Choice[]) {
  const matches = groups.filter(group => group.choices.length === choices.length &&
    group.choices.every(option => choices.some(choice => choiceKey(choice.key) === option.key &&
      fingerprint(choice.text) === fingerprint(option.text))));
  return matches.length === 1 ? matches[0].markedKeys : [];
}
