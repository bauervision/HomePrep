"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { invitationLink } from "@/lib/household";
import { Button, Input } from "./ui";

/**
 * A copyable invitation link. HomePrep sends no email: the person who created
 * the invitation shares the link themselves.
 */
export function InvitationLink({ id, email }: { id: string; email: string }) {
  const [copied, setCopied] = useState(false);
  const link = invitationLink(window.location.origin, id);
  return (
    <div
      className="space-y-2 rounded-md border border-pine/35 bg-pine/[0.06] p-3"
      data-testid="invitation-link"
    >
      <div className="flex gap-2">
        <Input
          readOnly
          aria-label="Invitation link"
          value={link}
          onFocus={(e) => e.target.select()}
          className="font-mono text-xs"
        />
        <Button
          icon={copied ? Check : Copy}
          onClick={() =>
            navigator.clipboard
              ?.writeText(link)
              .then(() => setCopied(true))
              .catch(() => undefined)
          }
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
      <p className="text-[11px] text-slate">
        No email is sent. Send this link to {email} yourself. It works only for
        that Google account, once, for 7 days.
      </p>
    </div>
  );
}
