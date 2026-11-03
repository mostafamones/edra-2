// A lifecycle fence, never an authentication or academy-authority decision.
let generation = 0;
export function browserScopeGeneration() { return generation; }
export function advanceBrowserScope() { generation += 1; }
