// @vitest-environment node
import {
  addTodoInputSchema,
  errorBodySchema,
  todoFilterSchema,
  updateTodoInputSchema,
} from "@todo-cat/contract";
import { describe, expect, test } from "vitest";

describe("addTodoInputSchema", () => {
  test("trims the title and defaults the due date to none", () => {
    expect(addTodoInputSchema.parse({ title: "  Feed Lissie  " })).toEqual({
      title: "Feed Lissie",
      dueDate: null,
    });
  });

  test("rejects blank titles and dates that are not plain dates", () => {
    expect(addTodoInputSchema.safeParse({ title: "   " }).success).toBe(false);
    for (const dueDate of ["2026-02-30", "2026-10-05T00:00:00Z", "tomorrow"]) {
      expect(
        addTodoInputSchema.safeParse({ title: "x", dueDate }).success,
      ).toBe(false);
    }
  });
});

describe("updateTodoInputSchema", () => {
  test("needs at least one field", () => {
    expect(updateTodoInputSchema.safeParse({}).success).toBe(false);
    expect(updateTodoInputSchema.safeParse({ done: false }).success).toBe(true);
    expect(updateTodoInputSchema.safeParse({ dueDate: null }).success).toBe(
      true,
    );
  });
});

describe("todoFilterSchema", () => {
  test("defaults to all todos", () => {
    expect(todoFilterSchema.parse({})).toEqual({ status: "all" });
    expect(todoFilterSchema.safeParse({ status: "nope" }).success).toBe(false);
  });
});

describe("errorBodySchema", () => {
  test("accepts the documented shape only", () => {
    const body = { error: { code: "todo-not-found", message: "Nope" } };
    expect(errorBodySchema.parse(body)).toEqual(body);
    expect(
      errorBodySchema.safeParse({ error: { code: "teapot", message: "" } })
        .success,
    ).toBe(false);
  });
});
