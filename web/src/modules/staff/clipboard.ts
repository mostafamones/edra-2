/** Start promised writes during the click so browsers retain permission while the server creates the link. */
export async function copyInvitationLink(text: string | Promise<string>, container: HTMLElement) {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      if (typeof text !== "string" && typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        const content = text.then((link) => new Blob([link], { type: "text/plain" }));
        void content.catch(() => {});
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": content })]);
      } else {
        const link = typeof text === "string" ? text : await text;
        await navigator.clipboard.writeText(link);
      }
      return;
    } catch {
      // Plain HTTP and denied API writes use the selected-field fallback below.
    }
  }
  const link = typeof text === "string" ? text : await text;
  const field = document.createElement("textarea");
  field.value = link;
  field.setAttribute("readonly", "");
  field.setAttribute("aria-hidden", "true");
  field.style.cssText = "position:fixed;top:0;left:-9999px;width:1px;height:1px;opacity:0;user-select:text";
  // Radix traps focus in open dialogs and menus. Keep the field within that scope.
  const host = container.isConnected ? container : document.body;
  const previouslyFocused = document.activeElement;
  host.appendChild(field);
  field.addEventListener("copy", (event) => {
    if (!event.clipboardData) return;
    event.clipboardData.setData("text/plain", link);
    event.preventDefault();
    event.stopPropagation();
  });
  let copied = false;
  try {
    field.focus();
    field.select();
    field.setSelectionRange(0, link.length);
    copied = document.execCommand("copy");
  } finally {
    field.remove();
    if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
      previouslyFocused.focus({ preventScroll: true });
    }
  }
  if (!copied) throw new Error("copy failed");
}
