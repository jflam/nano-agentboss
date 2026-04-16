import { describe, expect, test } from "bun:test";

import { jsonType } from "@nanoboss/procedure-sdk";

describe("jsonType", () => {
  interface Answer {
    answer: number;
  }

  test("builds a schema and validator from the type", () => {
    const descriptor = jsonType<Answer>(
      {
        type: "object",
        properties: {
          answer: { type: "number" },
        },
        required: ["answer"],
      },
      (input): input is Answer =>
        typeof input === "object"
        && input !== null
        && "answer" in input
        && typeof input.answer === "number",
    );

    expect(descriptor.schema).toEqual({
      type: "object",
      properties: {
        answer: { type: "number" },
      },
      required: ["answer"],
    });
    expect(descriptor.validate({ answer: 42 })).toBe(true);
    expect(descriptor.validate({ answer: "nope" })).toBe(false);
  });

  test("throws when called without transformed typia inputs", () => {
    expect(() => {
      // @ts-expect-error intentional misuse for runtime guard coverage
      jsonType<Answer>();
    }).toThrow(
      "jsonType(...) requires concrete schema and validator arguments",
    );
  });
});
