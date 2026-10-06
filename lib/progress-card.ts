// The progress card as A2UI operations. The component tree is authored once,
// here, and never changes; the numbers travel in the data model and the tree
// binds to them by path, so nothing numeric is written into the tree and the
// model never sees or produces any of it.
//
// No `server-only` on purpose: the catalog id is shared with the browser
// catalog (components/a2ui/catalog.tsx), and the unit test imports this file.

// Must equal the id the client catalog is registered under, or the renderer
// answers "Catalog not found".
export const PROGRESS_CATALOG_ID = "todo-cat://catalog/progress";
export const PROGRESS_SURFACE_ID = "todo-progress";

export type ProgressCounts = { total: number; done: number; open: number };

// A2UI v0.9: a flat list of components that point at each other by id; the
// one called "root" starts the tree.
const PROGRESS_COMPONENTS = [
  { id: "root", component: "Card", child: "body" },
  { id: "body", component: "Column", children: ["title", "bar"] },
  { id: "title", component: "Text", variant: "h4", text: "Your list" },
  {
    id: "bar",
    component: "ProgressBar",
    value: { path: "/done" },
    max: { path: "/total" },
    remaining: { path: "/open" },
  },
];

export function progressOperations({ total, done, open }: ProgressCounts) {
  return [
    {
      version: "v0.9",
      createSurface: {
        surfaceId: PROGRESS_SURFACE_ID,
        catalogId: PROGRESS_CATALOG_ID,
      },
    },
    {
      version: "v0.9",
      updateComponents: {
        surfaceId: PROGRESS_SURFACE_ID,
        components: PROGRESS_COMPONENTS,
      },
    },
    {
      version: "v0.9",
      updateDataModel: {
        surfaceId: PROGRESS_SURFACE_ID,
        path: "/",
        value: { total, done, open },
      },
    },
  ];
}
