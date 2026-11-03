import { createDefaultSerovalPlugins } from "@tanstack/router-core/ssr/client";
import { fromCrossJSON, toCrossJSONAsync } from "seroval";

/** The installed serializer pair Start's server-function response and browser fetcher use, with the wire step made explicit. */
export async function throughTransport<T>(value: T): Promise<T> {
  const plugins = createDefaultSerovalPlugins();
  const wire = JSON.stringify(await toCrossJSONAsync(value, { refs: new Map(), plugins }));
  return fromCrossJSON(JSON.parse(wire), { refs: new Map(), plugins }) as T;
}
