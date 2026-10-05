// Seeds the demo user and their todos into the database named by DATABASE_URL.
// Run through `npm run db:seed` (tsx with the react-server condition, so the
// `server-only` imports resolve to their empty variant).
async function main() {
  try {
    process.loadEnvFile(".env");
  } catch {}

  // Imported after the env file is loaded: lib/db reads DATABASE_URL on import.
  const { seedDemo, DEMO_EMAIL, DEMO_PASSWORD } = await import(
    "@/lib/dev-seed"
  );
  const { db } = await import("@/lib/db");

  await seedDemo();
  db.$client.close();
  console.log(`seeded ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
