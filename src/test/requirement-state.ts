import { BASELINE } from "@/lib/baseline";
import type { MilestoneKey, RequirementState } from "@/lib/types";

/** Household state confirming every attestable baseline requirement. */
export function confirmedState(milestones: MilestoneKey[]): RequirementState {
  const at = "2026-10-30T12:00:00.000Z";
  return Object.fromEntries(
    BASELINE.filter(
      (d) =>
        d.milestones.some((m) => milestones.includes(m)) &&
        d.completion.conditions.some((c) => c.kind === "attest"),
    ).map((d) => [d.id, { confirmed: { by: "Test", at }, updatedAt: at }]),
  );
}
