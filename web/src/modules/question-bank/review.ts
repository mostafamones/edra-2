import { createServerFn } from "@tanstack/react-start";
import { reviewPageOnServer } from "./review.server";

export const reviewQuestionPage = createServerFn({ method: "POST", strict: false })
  .validator((value: unknown) => value)
  .handler(({ data }) => reviewPageOnServer(data));
