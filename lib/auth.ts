import "server-only";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { bearer, deviceAuthorization } from "better-auth/plugins";
import { db } from "@/lib/db";
import * as schema from "@/lib/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  emailAndPassword: { enabled: true },
  plugins: [
    bearer(),
    deviceAuthorization({ verificationUri: "/device" }),
    nextCookies(), // must stay last
  ],
});
