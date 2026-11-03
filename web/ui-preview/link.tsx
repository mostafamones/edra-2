import type { ComponentProps } from "react";

/** Fixture navigation exposes real destinations without mounting the application router. */
export default function PreviewLink(props: ComponentProps<"a">) {
  return <a {...props} />;
}
