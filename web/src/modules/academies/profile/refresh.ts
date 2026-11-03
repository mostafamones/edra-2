/** Refreshing the shell must never change the outcome of a committed profile save. */
export async function refreshProfileShell(refresh: () => void | Promise<void>): Promise<void> {
  try {
    await refresh();
  } catch (error) {
    console.error("Academy profile refresh failed", error);
  }
}
