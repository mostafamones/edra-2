import type { ContentItem } from "../types";

/** A top-level material and its children: an assessment's answers, or the documents attached to an explanation video. */
export type MaterialNode = { item: ContentItem; children: ContentItem[] };
type IsDocument = (item: ContentItem) => boolean;

const answers = (assessment: ContentItem, item: ContentItem) => assessment.kind === "assessment" && item.kind === "answer"
  && item.assessmentKind === assessment.assessmentKind && item.assessmentId === assessment.assessmentId;
const isAttached = (item: ContentItem) => item.kind === "document" && item.attached === true;

/** An answer belongs to its assessment; an attached document to the explanation stored before it. */
export function parentOf(items: ContentItem[], item: ContentItem) {
  if (item.kind === "answer") return items.find(a => answers(a, item));
  if (!isAttached(item)) return undefined;
  for (let i = items.findIndex(x => x.id === item.id) - 1; i >= 0; i--)
    if (!isAttached(items[i])) return items[i].kind === "explanation" ? items[i] : undefined;
}

export function materialTree(items: ContentItem[]): MaterialNode[] {
  const parents = new Map(items.map(i => [i.id, parentOf(items, i)?.id]));
  return items.filter(i => !parents.get(i.id)).map(item => ({ item, children: items.filter(i => parents.get(i.id) === item.id) }));
}
const flatten = (tree: MaterialNode[]) => tree.flatMap(n => [n.item, ...n.children]);

function bare(item: ContentItem) {
  const { assessmentKind: _kind, assessmentId: _id, attached: _attached, ...rest } = item; void _kind; void _id; void _attached;
  return rest;
}
/** The item as top-level material: answers return to explanations/documents, attached documents stand alone. */
const detached = (item: ContentItem, isDocument: IsDocument): ContentItem => ({ ...bare(item), kind: item.kind === "answer" ? isDocument(item) ? "document" : "explanation" : item.kind });
const childOf = (item: ContentItem, parent: ContentItem): ContentItem => parent.kind === "assessment"
  ? { ...bare(item), kind: "answer", assessmentKind: parent.assessmentKind, assessmentId: parent.assessmentId }
  : { ...bare(item), kind: "document", attached: true };

/** Whether `item` may become a child of `parent`: anything but an assessment answers one; only documents attach to a video. */
export function canAttach(item: ContentItem, parent: ContentItem, isDocument: IsDocument) {
  if (item.kind === "assessment" || item.id === parent.id) return false;
  return parent.kind === "assessment" || (parent.kind === "explanation" && isDocument(item));
}

/** What dropping `dragged` on `target` may do: attach it to the target's parent row and/or place it beside the target. */
export function dropOptions(items: ContentItem[], dragged: ContentItem, target: ContentItem, isDocument: IsDocument): { link: ContentItem | null; place: boolean } {
  if (dragged.id === target.id) return { link: null, place: false };
  const parent = parentOf(items, target), current = parentOf(items, dragged);
  const host = target.kind === "assessment" || target.kind === "explanation" ? target : parent;
  return { link: host && current?.id !== host.id && canAttach(dragged, host, isDocument) ? host : null, place: parent ? current?.id === parent.id : true };
}

/** Makes the material (existing or new) the parent's last child. A moved parent's own children stay behind as top-level material. */
export function linkMaterial(items: ContentItem[], item: ContentItem, parent: ContentItem, isDocument: IsDocument): ContentItem[] {
  if (!canAttach(item, parent, isDocument)) return items;
  const tree = materialTree(items).flatMap(n => n.item.id !== item.id ? [{ ...n, children: n.children.filter(c => c.id !== item.id) }]
    : n.children.map(c => ({ item: detached(c, isDocument), children: [] })));
  return flatten(tree.map(n => n.item.id === parent.id ? { ...n, children: [...n.children, childOf(item, parent)] } : n));
}

/** Moves a material before/after `targetId` among the target's siblings. A child placed at the top level is detached. */
export function placeMaterial(items: ContentItem[], id: string, targetId: string, after: boolean, isDocument: IsDocument): ContentItem[] {
  const item = items.find(i => i.id === id), target = items.find(i => i.id === targetId);
  if (!item || !target || !dropOptions(items, item, target, isDocument).place) return items;
  const tree = materialTree(items);
  const node = tree.find(n => n.item.id === id);
  const rest = node ? tree.filter(n => n !== node) : tree.map(n => ({ ...n, children: n.children.filter(c => c.id !== id) }));
  const parent = parentOf(items, target);
  if (parent) return flatten(rest.map(n => {
    if (n.item.id !== parent.id) return n;
    const at = n.children.findIndex(c => c.id === targetId) + (after ? 1 : 0);
    return { ...n, children: [...n.children.slice(0, at), item, ...n.children.slice(at)] };
  }));
  const at = rest.findIndex(n => n.item.id === targetId) + (after ? 1 : 0);
  return flatten([...rest.slice(0, at), node ?? { item: detached(item, isDocument), children: [] }, ...rest.slice(at)]);
}

/** Moves a material one step among its siblings. */
export function moveMaterial(items: ContentItem[], id: string, delta: -1 | 1, isDocument: IsDocument): ContentItem[] {
  const item = items.find(i => i.id === id);
  if (!item) return items;
  const parent = parentOf(items, item), tree = materialTree(items);
  const siblings = parent ? tree.find(n => n.item.id === parent.id)!.children : tree.map(n => n.item);
  const target = siblings[siblings.findIndex(s => s.id === id) + delta];
  return target ? placeMaterial(items, id, target.id, delta > 0, isDocument) : items;
}

/** Detaches a child to just after its parent's group. */
export function unlinkMaterial(items: ContentItem[], id: string, isDocument: IsDocument): ContentItem[] {
  const item = items.find(i => i.id === id), parent = item && parentOf(items, item);
  if (!item || !parent) return items;
  return flatten(materialTree(items).flatMap(n => n.item.id !== parent.id ? [n]
    : [{ ...n, children: n.children.filter(c => c.id !== id) }, { item: detached(item, isDocument), children: [] }]));
}

/** Removing a parent keeps its children as top-level material. */
export function removeMaterial(items: ContentItem[], id: string, isDocument: IsDocument): ContentItem[] {
  return flatten(materialTree(items).flatMap(n => n.item.id !== id
    ? [{ ...n, children: n.children.filter(c => c.id !== id) }]
    : n.children.map(c => ({ item: detached(c, isDocument), children: [] }))));
}
