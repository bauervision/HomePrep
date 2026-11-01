#!/usr/bin/env node
/*
 * Privileged HomePrep operations. Runs on an operator's machine with the
 * Firebase Admin SDK; never shipped to the browser.
 *
 *   node scripts/admin.mjs grant-admin <email> --project <id> [--apply]
 *   node scripts/admin.mjs revoke-admin <email> --project <id> [--apply]
 *   node scripts/admin.mjs bootstrap-registrations --project <id> [--apply]
 *
 * Without --apply nothing is written: it prints what would change.
 *
 * Credentials: Application Default Credentials for an account with access to
 * the project (`gcloud auth application-default login`), or
 * GOOGLE_APPLICATION_CREDENTIALS. With FIRESTORE_EMULATOR_HOST and
 * FIREBASE_AUTH_EMULATOR_HOST set, it talks to the local emulators instead.
 *
 * grant-admin binds platform administration to the account's immutable UID
 * through the custom claim `platformAdmin`, after checking that the account
 * exists and its email is verified. The person must sign out and in again
 * (or the app refreshes the token on next load) for it to take effect.
 */
import {
  applyBootstrap,
  describePlan,
  planBootstrap,
  SERVER_TIME,
} from "./registration-lib.mjs";

function fail(message) {
  console.error(`admin: ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? fail(`${name} needs a value`));
};
const apply = args.includes("--apply");
const project = flag("--project");
const [command, target] = args.filter(
  (a, i) => !a.startsWith("--") && args[i - 1] !== "--project",
);

if (!command)
  fail(
    "usage: admin.mjs <grant-admin|revoke-admin|bootstrap-registrations> ... --project <id> [--apply]",
  );
if (!project) fail("--project is required (no default project is assumed)");

const { initializeApp, applicationDefault } =
  await import("firebase-admin/app");
const { getAuth } = await import("firebase-admin/auth");
const { getFirestore, FieldValue } = await import("firebase-admin/firestore");

const emulated = !!process.env.FIRESTORE_EMULATOR_HOST;
initializeApp(
  emulated
    ? { projectId: project }
    : { projectId: project, credential: applicationDefault() },
);
console.log(
  `project ${project}${emulated ? " (emulators)" : ""} — ${apply ? "APPLYING" : "dry run"}`,
);

async function setAdmin(email, on) {
  if (!email) fail("an email is required");
  const user = await getAuth().getUserByEmail(email.trim().toLowerCase());
  if (on && !user.emailVerified)
    fail(`${user.email} has no verified email; refusing to grant admin`);
  const claims = { ...(user.customClaims ?? {}) };
  const current = claims.platformAdmin === true;
  console.log(`${user.email} → uid ${user.uid}; platformAdmin is ${current}`);
  if (current === on) return console.log("No change needed.");
  if (on) claims.platformAdmin = true;
  else delete claims.platformAdmin;
  if (!apply) return console.log(`Would set platformAdmin = ${on}.`);
  await getAuth().setCustomUserClaims(user.uid, claims);
  console.log(`Set platformAdmin = ${on} for uid ${user.uid}.`);
}

async function bootstrap() {
  const fs = getFirestore();
  const households = [];
  for (const h of (await fs.collection("households").get()).docs) {
    const members = (await h.ref.collection("members").get()).docs.map((m) => ({
      id: m.id,
      data: m.data(),
    }));
    households.push({ id: h.id, data: h.data(), members });
  }
  const registrations = new Map(
    (await fs.collection("registrations").get()).docs.map((d) => [
      d.id,
      d.data(),
    ]),
  );
  const plan = planBootstrap(households, registrations);
  for (const line of describePlan(plan)) console.log(line);
  if (!apply)
    return console.log(`Would register ${plan.create.length} household(s).`);
  const n = await applyBootstrap(plan, (id, doc) =>
    // create() fails if the record appeared meanwhile: never overwrites.
    fs
      .collection("registrations")
      .doc(id)
      .create(
        Object.fromEntries(
          Object.entries(doc).map(([k, v]) => [
            k,
            v === SERVER_TIME ? FieldValue.serverTimestamp() : v,
          ]),
        ),
      ),
  );
  console.log(`Registered ${n} household(s).`);
}

switch (command) {
  case "grant-admin":
    await setAdmin(target, true);
    break;
  case "revoke-admin":
    await setAdmin(target, false);
    break;
  case "bootstrap-registrations":
    await bootstrap();
    break;
  default:
    fail(`unknown command ${command}`);
}
