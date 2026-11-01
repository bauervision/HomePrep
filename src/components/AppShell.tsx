"use client";

import { House, Link2, LogIn, MailOpen, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { invitationPath, parseInvitationRef } from "@/lib/household";
import { Logo, LogoMark } from "./brand/Logo";
import { VersionLabel } from "./brand/VersionLabel";
import { WildernessBackdrop } from "./brand/WildernessBackdrop";
import { MobileNav } from "./MobileNav";
import { QuickNote } from "./notes/QuickNote";
import { isActive, navFor } from "./nav";
import { useSession } from "./SessionProvider";
import {
  Button,
  CardTitle,
  cx,
  ErrorText,
  Field,
  Input,
  linkClass,
} from "./ui";

/** Full-bleed cinematic stage for sign-in, onboarding and status screens. */
function Stage({ children }: { children: ReactNode }) {
  return (
    <>
      <WildernessBackdrop variant="full" />
      <main className="flex flex-1 flex-col px-4 py-6 sm:px-8 sm:py-10">
        {children}
      </main>
    </>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <Stage>
      <div className="m-auto flex w-full flex-col items-center">{children}</div>
    </Stage>
  );
}

function AccountButton({
  email,
  onClick,
}: {
  email: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={email ?? undefined}
      className="group flex min-w-0 items-center gap-2.5 rounded-full py-1 pr-2 pl-1 text-sm text-ivory-dim outline-none hover:text-ivory focus-visible:ring-2 focus-visible:ring-amber"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line-strong bg-white/[0.03] text-sage group-hover:text-ivory">
        <UserRound size={16} aria-hidden />
      </span>
      <span className="truncate">
        Sign out<span className="hidden sm:inline"> {email}</span>
      </span>
    </button>
  );
}

export function SignIn({ notice }: { notice?: string } = {}) {
  const { signIn } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Centered>
      <div className="surface w-full max-w-md px-6 py-8 text-center sm:px-10">
        <div className="flex justify-center">
          <LogoMark size={88} title="HomePrep" />
        </div>
        <h1 className="mt-4 text-4xl font-bold tracking-tight">
          <span className="text-ivory">Home</span>
          <span className="text-copper-gradient">Prep</span>
        </h1>
        <p className="mt-2 text-[11px] font-medium tracking-[0.16em] text-sage uppercase sm:tracking-[0.28em]">
          Prepare today. Protect tomorrow.
        </p>
        <VersionLabel className="mt-2 block" />
        <p className="mt-6 text-sm text-ivory-dim">
          {notice ??
            "Private household preparedness workspace. Sign in to continue."}
        </p>
        <Button
          variant="emerald"
          size="lg"
          icon={LogIn}
          loading={busy}
          className="mt-5 w-full"
          onClick={() => {
            setBusy(true);
            setError(null);
            signIn()
              .catch((e: Error) => setError(e.message))
              .finally(() => setBusy(false));
          }}
        >
          Sign in with Google
        </Button>
        <div className="mt-3">
          <ErrorText>{error}</ErrorText>
        </div>
      </div>
    </Centered>
  );
}

/**
 * Signed in, but not in a household. HomePrep is invite-only: households are
 * founded from an administrator's owner invitation and joined from a
 * household's member invitation, both opened by link.
 */
export function Onboarding() {
  const { state, signOut, admin } = useSession();
  const router = useRouter();
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const user = state.status === "noHousehold" ? state.user : null;
  if (!user) return null;

  function open(e: FormEvent) {
    e.preventDefault();
    const id = parseInvitationRef(link);
    if (!id) {
      setError("Paste the whole invitation link you were sent.");
      return;
    }
    router.push(invitationPath(id));
  }

  return (
    <Stage>
      <div className="m-auto w-full max-w-[1100px]">
        <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <Logo size="lg" tagline />
          <AccountButton email={user.email} onClick={signOut} />
        </header>

        {state.status === "noHousehold" && state.notice && (
          <p role="status" className="mt-6 text-sm text-amber">
            {state.notice}
          </p>
        )}

        <div className="mt-6 grid gap-5 sm:mt-8 md:grid-cols-2 md:gap-6">
          <form onSubmit={open} className="surface flex flex-col p-6 sm:p-8">
            <CardTitle icon={MailOpen} large>
              Open your invitation
            </CardTitle>
            <p className="mt-5 text-[15px] leading-relaxed text-ivory-dim sm:text-base">
              HomePrep is invite-only. Open the invitation link a household
              owner or the HomePrep administrator sent you, signed in as{" "}
              <span className="text-ivory">{user.email}</span>.
            </p>
            <div className="mt-auto pt-5">
              <Field label="Invitation link">
                <Input
                  icon={Link2}
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://…/invite/?id=…"
                  autoComplete="off"
                  spellCheck={false}
                  className="h-12"
                />
              </Field>
              <Button
                type="submit"
                variant="emerald"
                size="lg"
                icon={LogIn}
                disabled={!link.trim()}
                className="mt-4 w-full justify-start"
              >
                Open invitation
              </Button>
              <div className="mt-3">
                <ErrorText>{error}</ErrorText>
              </div>
            </div>
          </form>

          <div className="surface flex flex-col p-6 sm:p-8">
            <CardTitle icon={House} large>
              No invitation yet?
            </CardTitle>
            <p className="mt-5 text-[15px] leading-relaxed text-ivory-dim sm:text-base">
              To join your family’s household, ask its owner to invite this
              Google account from their Household page. New households are
              approved by the HomePrep administrator during the private beta.
            </p>
            {admin && (
              <Link
                href="/admin/"
                className={cx("mt-auto pt-5 text-sm", linkClass)}
              >
                Open Admin
              </Link>
            )}
          </div>
        </div>
      </div>
    </Stage>
  );
}

export function TopBar() {
  const { state, signOut, admin } = useSession();
  const pathname = usePathname();
  if (state.status !== "ready") return null;
  const items = navFor(!!admin);
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-[#040b11]/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-3 sm:gap-5 sm:px-5">
        <Link
          href="/"
          className="shrink-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-amber"
          aria-label="HomePrep dashboard"
        >
          <Logo size="sm" version />
        </Link>
        <nav
          aria-label="Main"
          className="hidden min-w-0 flex-1 gap-0.5 lg:flex"
        >
          {items.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-amber",
                  active ? "text-ivory" : "text-sage hover:text-ivory",
                )}
              >
                <Icon
                  size={15}
                  aria-hidden
                  className={active ? "text-copper-light" : "text-slate"}
                />
                {label}
                {active && (
                  <span className="absolute inset-x-2.5 -bottom-[9px] h-0.5 rounded-full bg-gradient-to-r from-copper-light to-copper" />
                )}
              </Link>
            );
          })}
        </nav>
        <span className="flex-1 lg:hidden" />
        <span className="hidden max-w-40 truncate text-xs text-slate xl:inline">
          {state.household.name}
        </span>
        <QuickNote />
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          title={state.user.email ?? ""}
          className="hidden lg:inline-flex"
        >
          Sign out
        </Button>
        <div className="lg:hidden">
          <MobileNav
            pathname={pathname}
            onSignOut={signOut}
            items={items}
            account={[state.household.name, state.user.email]
              .filter(Boolean)
              .join(" · ")}
          />
        </div>
      </div>
    </header>
  );
}

/** Interior layout: quiet backdrop, navigation and content column. */
export function InteriorFrame({
  banner,
  children,
}: {
  banner?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <WildernessBackdrop variant="quiet" />
      <TopBar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-4 sm:px-5">
        {banner}
        {children}
      </main>
    </>
  );
}

const DEV_PREVIEW =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_HOMEPREP_PREVIEW === "1";

/** Signed in, outside a household: a plain frame with a way back out. */
function AccountFrame({ children }: { children: ReactNode }) {
  const { state, signOut } = useSession();
  const email =
    state.status === "noHousehold" || state.status === "error"
      ? state.user.email
      : null;
  return (
    <Stage>
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <Link href="/" aria-label="HomePrep" className="rounded-md">
            <Logo size="sm" version />
          </Link>
          <AccountButton email={email} onClick={signOut} />
        </header>
        {children}
      </div>
    </Stage>
  );
}

/** Routes that work with or without a household (once signed in). */
const ACCOUNT_ROUTES = ["/invite", "/admin"];

export function AppShell({ children }: { children: ReactNode }) {
  const { state, signOut } = useSession();
  const pathname = usePathname();

  // Development-only design preview renders its own frames with fixture data.
  if (DEV_PREVIEW && pathname.startsWith("/preview")) return <>{children}</>;

  // Invitations and Admin don't need a household: someone accepting an owner
  // invitation has none yet.
  const accountRoute = ACCOUNT_ROUTES.some((r) => pathname.startsWith(r));
  if (accountRoute && state.status === "signedOut")
    return (
      <SignIn
        notice={
          pathname.startsWith("/invite")
            ? "Sign in with the Google account your invitation was sent to."
            : undefined
        }
      />
    );
  if (accountRoute && state.status === "noHousehold")
    return <AccountFrame>{children}</AccountFrame>;

  switch (state.status) {
    case "unconfigured":
      return (
        <Centered>
          <p className="surface max-w-md p-6 text-center text-sm text-ivory-dim">
            Firebase is not configured. Copy <code>.env.example</code> to{" "}
            <code>.env.local</code> and set the web app values.
          </p>
        </Centered>
      );
    case "loading":
      return (
        <Centered>
          <div className="flex flex-col items-center gap-4" role="status">
            <LogoMark
              size={72}
              title={null}
              className="motion-safe:animate-pulse"
            />
            <span className="text-xs tracking-[0.28em] text-sage uppercase">
              Loading…
            </span>
          </div>
        </Centered>
      );
    case "signedOut":
      return <SignIn />;
    case "error":
      return (
        <Centered>
          <div className="surface max-w-md space-y-4 p-6 text-center">
            <LogoMark size={56} title={null} className="mx-auto" />
            <p role="alert" className="text-sm text-rust">
              Could not load your household: {state.message}
            </p>
            <Button onClick={signOut}>Sign out</Button>
          </div>
        </Centered>
      );
    case "noHousehold":
      return <Onboarding />;
    case "ready":
      return (
        <InteriorFrame
          banner={
            state.seedError && (
              <p role="alert" className="mb-3 text-sm text-rust">
                {state.seedError}
              </p>
            )
          }
        >
          {children}
        </InteriorFrame>
      );
  }
}
