"use client";

import { House } from "lucide-react";
import Link from "next/link";
import { useHousehold } from "@/components/SessionProvider";
import { Card, cx, linkClass } from "@/components/ui";

// Old invite-code links (/join/?code=…) from before 0.7.0. Users without a
// household see the invitation screen via AppShell; this page only renders
// for users who already belong to one.
export default function JoinPage() {
  const { household } = useHousehold();
  return (
    <div className="mx-auto max-w-md pt-10">
      <Card title="Already a member" icon={House}>
        <p className="text-sm text-ivory-dim">
          You already belong to{" "}
          <span className="font-medium">{household.name}</span>. Invite codes
          were replaced by invitation links: ask for a new link if you were
          invited to another household.
        </p>
        <Link href="/" className={cx("mt-3 inline-block text-sm", linkClass)}>
          Go to dashboard
        </Link>
      </Card>
    </div>
  );
}
