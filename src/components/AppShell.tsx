"use client";

import { House, KeyRound, LogIn, Plus, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { createHousehold, JoinError, joinWithInvite } from "@/lib/household";
import { Logo, LogoMark } from "./brand/Logo";
import { WildernessBackdrop } from "./brand/WildernessBackdrop";
import { MobileNav } from "./MobileNav";
import { isActive, NAV } from "./nav";
import { useSession } from "./SessionProvider";
import { Button, CardTitle, cx, ErrorText, Field, Input } from "./ui";

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

export function SignIn() {
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
        <p className="mt-6 text-sm text-ivory-dim">
          Private household preparedness workspace. Sign in to continue.
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

export function Onboarding() {
  const { state, signOut } = useSession();
  const user = state.status === "noHousehold" ? state.user : null;
  const [name, setName] = useState("Our Household");
  const [size, setSize] = useState(5);
  const [code, setCode] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("code") ?? ""),
  );
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy("create");
    setError(null);
    try {
      await createHousehold(user!, name.trim() || "Our Household", size);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  async function onJoin(e: FormEvent) {
    e.preventDefault();
    setBusy("join");
    setError(null);
    try {
      await joinWithInvite(user!, code);
    } catch (err) {
      setError(
        err instanceof JoinError
          ? err.message
          : `Could not join: ${(err as Error).message}`,
      );
      setBusy(null);
    }
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
          <form onSubmit={onJoin} className="surface flex flex-col p-6 sm:p-8">
            <CardTitle icon={Users} large>
              Join your household
            </CardTitle>
            <p className="mt-5 text-[15px] leading-relaxed text-ivory-dim sm:text-base">
              Enter the invite code a household member shared with you. Codes
              are single-use and expire after 7 days.
            </p>
            <div className="mt-auto pt-5">
              <Field label="Invite code">
                <Input
                  icon={KeyRound}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
                  autoComplete="off"
                  spellCheck={false}
                  className="h-12 font-mono tracking-wider uppercase"
                />
              </Field>
              <Button
                type="submit"
                variant="emerald"
                size="lg"
                icon={LogIn}
                loading={busy === "join"}
                disabled={!!busy || !code.trim()}
                className="mt-4 w-full justify-start"
              >
                {busy === "join" ? "Joining…" : "Join household"}
              </Button>
            </div>
          </form>

          <form
            onSubmit={onCreate}
            className="surface flex flex-col p-6 sm:p-8"
          >
            <CardTitle icon={House} large>
              Start a new household
            </CardTitle>
            <p className="mt-5 text-[15px] leading-relaxed text-ivory-dim sm:text-base">
              Create a private workspace, then invite the other adults in your
              home.
            </p>
            <div className="mt-auto pt-5">
              <div className="grid grid-cols-[1fr_7.5rem] gap-3">
                <Field label="Household name">
                  <Input
                    icon={House}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                    className="h-12"
                  />
                </Field>
                <Field label="People">
                  <Input
                    icon={Users}
                    type="number"
                    min={1}
                    max={30}
                    value={size}
                    onChange={(e) =>
                      setSize(
                        Math.max(1, Math.min(30, Number(e.target.value) || 1)),
                      )
                    }
                    className="h-12"
                  />
                </Field>
              </div>
              <Button
                type="submit"
                variant="copper"
                size="lg"
                icon={Plus}
                loading={busy === "create"}
                disabled={!!busy}
                className="mt-4 w-full sm:w-auto sm:min-w-[13rem]"
              >
                {busy === "create" ? "Creating…" : "Create household"}
              </Button>
            </div>
          </form>
        </div>
        <div className="mt-4">
          <ErrorText>{error}</ErrorText>
        </div>
      </div>
    </Stage>
  );
}

export function TopBar() {
  const { state, signOut } = useSession();
  const pathname = usePathname();
  if (state.status !== "ready") return null;
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-[#040b11]/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-3 sm:gap-5 sm:px-5">
        <Link
          href="/"
          className="shrink-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-amber"
          aria-label="HomePrep dashboard"
        >
          <Logo size="sm" />
        </Link>
        <nav
          aria-label="Main"
          className="hidden min-w-0 flex-1 gap-0.5 lg:flex"
        >
          {NAV.map(({ href, label, icon: Icon }) => {
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
        <span className="hidden max-w-40 truncate text-xs text-slate xl:inline">
          {state.household.name}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          title={state.user.email ?? ""}
          className="hidden lg:inline-flex"
        >
          Sign out
        </Button>
        <span className="flex-1 lg:hidden" />
        <div className="lg:hidden">
          <MobileNav
            pathname={pathname}
            onSignOut={signOut}
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

export function AppShell({ children }: { children: ReactNode }) {
  const { state, signOut } = useSession();
  const pathname = usePathname();

  // Development-only design preview renders its own frames with fixture data.
  if (DEV_PREVIEW && pathname.startsWith("/preview")) return <>{children}</>;

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
