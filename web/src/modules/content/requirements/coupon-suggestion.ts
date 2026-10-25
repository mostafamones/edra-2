type CouponChoice = { id: string; name: string };

function words(value: string) {
  return value.normalize("NFKD").replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}
export function isRevision(value: string) {
  return words(value).some(word => /^(revision|revisions|revise|revised|review|reviews|recap|recaps|recapitulation)$/.test(word) || /^(?:ال)?(?:مراجعه|مراجعات|تلخيص|ملخص|ملخصات)$/.test(word));
}
/** A naming hint only; it never changes the editor's selection. */
export function suggestCoupon(title: string, selectedId: string | null | undefined, types: CouponChoice[]): CouponChoice | null {
  if (words(title).join("").length < 3) return null;
  const revision = isRevision(title), selected = types.find(type => type.id === selectedId);
  if (selected && isRevision(selected.name) === revision) return null;
  if (!revision && !selected) return null;
  const titleWords = new Set(words(title));
  const candidates = types.filter(type => type.id !== selectedId && isRevision(type.name) === revision);
  return candidates.sort((a,b) => {
    const score = (type: CouponChoice) => words(type.name).filter(word => titleWords.has(word)).length + (!revision && /^(regular|standard|عادي|العادي)$/i.test(type.name.trim()) ? 2 : 0);
    return score(b)-score(a) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  })[0] ?? null;
}
