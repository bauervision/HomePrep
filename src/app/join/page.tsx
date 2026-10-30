"use client";

import { House } from "lucide-react";
import Link from "next/link";
import { useHousehold } from "@/components/SessionProvider";
import { Card, cx, linkClass } from "@/components/ui";

// Users without a household see the join form (code pre-filled from ?code=) via
// AppShell. This page only renders for users who already belong to one.
export default function JoinPage() {
  const { household } = useHousehold();
  return (
    <div className="mx-auto max-w-md pt-10">
      <Card title="Already a member" icon={House}>
        <p className="text-sm text-ivory-dim">
          You already belong to{" "}
          <span className="font-medium">{household.name}</span>. An account can
          be in one household at a time.
        </p>
        <Link href="/" className={cx("mt-3 inline-block text-sm", linkClass)}>
          Go to dashboard
        </Link>
      </Card>
    </div>
  );
}
