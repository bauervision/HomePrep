/*
 * Registration bootstrap for households created before 0.7.0 (pure logic).
 * scripts/admin.mjs runs it against Firestore; tests run it against fixtures
 * and the emulator. It never creates, changes or deletes a household, a
 * membership or any household content: it only adds the platform
 * registration record (registrations/{householdId}) that 0.7.0 rules use for
 * member counts and that the Admin panel lists.
 */

export const ROLES = ["owner", "co-owner", "member"];

/** Marker for "the server's time" in planned documents. */
export const SERVER_TIME = Symbol("server time");

/**
 * Plans the bootstrap.
 *
 * @param households  [{ id, data, members: [{ id, data }] }]
 * @param registrations  Map of householdId -> existing registration data
 * @returns {{
 *   create: { id: string, doc: Record<string, unknown> }[],
 *   registered: string[],
 *   problems: { id: string, reason: string }[],
 * }}
 *
 * A household is registered only when its owner is unambiguous: `ownerUid`
 * names exactly one member, and that member is the only one with the owner
 * role. Anything else is reported, not guessed. Households that already have
 * a registration are left alone, so running it again changes nothing.
 */
export function planBootstrap(households, registrations) {
  const create = [];
  const registered = [];
  const problems = [];
  for (const h of households) {
    if (registrations.has(h.id)) {
      registered.push(h.id);
      continue;
    }
    const ownerUid = h.data?.ownerUid;
    const owners = h.members.filter((m) => m.data?.role === "owner");
    const unknown = h.members.filter((m) => !ROLES.includes(m.data?.role));
    let reason = null;
    if (typeof ownerUid !== "string" || !ownerUid)
      reason = "household has no ownerUid";
    else if (owners.length !== 1)
      reason = `expected one member with the owner role, found ${owners.length}`;
    else if (owners[0].id !== ownerUid)
      reason = `ownerUid ${ownerUid} is not the member with the owner role (${owners[0].id})`;
    else if (unknown.length > 0)
      reason = `members with an unknown role: ${unknown.map((m) => m.id).join(", ")}`;
    if (reason) {
      problems.push({ id: h.id, reason });
      continue;
    }
    const owner = owners[0];
    create.push({
      id: h.id,
      doc: {
        name: typeof h.data.name === "string" ? h.data.name : "",
        ownerUid,
        ownerEmail:
          typeof owner.data.email === "string"
            ? owner.data.email.trim().toLowerCase()
            : "",
        invitationId: "bootstrap",
        memberCount: h.members.length,
        status: "active",
        createdAt: h.data.createdAt ?? SERVER_TIME,
        updatedAt: SERVER_TIME,
        lastChange: ownerUid,
      },
    });
  }
  return { create, registered, problems };
}

/**
 * Applies a plan through `write(id, doc)`; each write must create the record
 * only if it is still absent (the caller's create-only write), so a
 * concurrent run can't overwrite one.
 *
 * @param {{ create: { id: string, doc: Record<string, unknown> }[] }} plan
 * @param {(id: string, doc: Record<string, unknown>) => Promise<unknown>} write
 */
export async function applyBootstrap(plan, write) {
  for (const { id, doc } of plan.create) await write(id, doc);
  return plan.create.length;
}

/** Human-readable summary lines. */
export function describePlan(plan) {
  const lines = [];
  for (const c of plan.create)
    lines.push(
      `register ${c.id}: "${c.doc.name}", owner ${c.doc.ownerEmail || c.doc.ownerUid}, ${c.doc.memberCount} member(s)`,
    );
  for (const id of plan.registered) lines.push(`already registered ${id}`);
  for (const p of plan.problems) lines.push(`SKIPPED ${p.id}: ${p.reason}`);
  return lines;
}
