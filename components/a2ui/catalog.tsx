"use client";

import {
  type CatalogComponentDefinition,
  createCatalog,
  DynamicNumberSchema,
} from "@copilotkit/a2ui-renderer";
import { z } from "zod/v3";
import { ProgressBar } from "@/components/a2ui/progress-bar";
import { PROGRESS_CATALOG_ID } from "@/lib/progress-card";

// The A2UI catalog the chat renders with: the basic components (Card, Column,
// Text, ...) plus the ones the basic catalog lacks.
//
// A prop that can be bound to the data model must be declared as a
// literal-or-path union (DynamicNumberSchema), or the binder leaves the
// `{ path }` object unresolved and React throws.
//
// The renderer is built on zod 3 and bundles its own copy of it, so its types
// and the `zod/v3` ones here differ nominally though the schemas are the same
// at runtime; the cast at `props` is the one place that gap is bridged.
// Typed loosely: the renderer's own schema type is too deep for tsc to instantiate.
const dynamicNumber = DynamicNumberSchema as unknown as z.ZodTypeAny;

const progressBarProps = z.object({
  value: dynamicNumber.describe("how many are done"),
  max: dynamicNumber.describe("the total"),
  remaining: dynamicNumber.optional().describe("how many are left"),
});

const definitions = {
  ProgressBar: {
    description:
      "A horizontal bar showing how much of a total is done, with the figures as text.",
    props: progressBarProps as unknown as CatalogComponentDefinition["props"],
  },
};

// Bound values reach the renderer already resolved to plain numbers.
type ProgressBarProps = { value: number; max: number; remaining?: number };

export const lissieCatalog = createCatalog(
  definitions,
  {
    ProgressBar: ({ props }) => {
      const { value, max, remaining } = props as unknown as ProgressBarProps;
      return <ProgressBar value={value} max={max} remaining={remaining} />;
    },
  },
  { catalogId: PROGRESS_CATALOG_ID, includeBasicCatalog: true },
);
