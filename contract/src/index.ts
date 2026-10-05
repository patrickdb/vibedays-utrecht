import { z } from "zod";

// A due date is a calendar date without a time: always `yyyy-mm-dd`, never a Date.
export const dueDateSchema = z.iso.date();

export const titleSchema = z.string().trim().min(1).max(200);

export const todoSchema = z.object({
  id: z.string(),
  title: z.string(),
  dueDate: dueDateSchema.nullable(),
  done: z.boolean(),
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});
export type Todo = z.infer<typeof todoSchema>;

export const addTodoInputSchema = z.object({
  title: titleSchema,
  dueDate: dueDateSchema.nullable().default(null),
});
export type AddTodoInput = z.infer<typeof addTodoInputSchema>;

// Only the fields that are present change; `dueDate: null` clears the due date.
export const updateTodoInputSchema = z
  .object({
    title: titleSchema,
    dueDate: dueDateSchema.nullable(),
    done: z.boolean(),
  })
  .partial()
  .refine(
    (patch) => Object.values(patch).some((value) => value !== undefined),
    {
      message: "Provide at least one of title, dueDate or done",
    },
  );
export type UpdateTodoInput = z.infer<typeof updateTodoInputSchema>;

export const todoStatusSchema = z.enum(["open", "done", "all"]);
export type TodoStatus = z.infer<typeof todoStatusSchema>;

export const todoFilterSchema = z.object({
  status: todoStatusSchema.default("all"),
  // Case-insensitive substring of the title.
  q: z.string().trim().min(1).optional(),
});
export type TodoFilter = z.infer<typeof todoFilterSchema>;

export const errorCodeSchema = z.enum([
  "unauthorized",
  "todo-not-found",
  "validation-failed",
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const errorBodySchema = z.object({
  error: z.object({ code: errorCodeSchema, message: z.string() }),
});
export type ErrorBody = z.infer<typeof errorBodySchema>;
