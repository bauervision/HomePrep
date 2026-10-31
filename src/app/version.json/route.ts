import { APP_VERSION } from "@/lib/version";

// Static file in the export (out/version.json): lets a deployment be checked
// with `pnpm release:verify <url>` without opening the app.
export const dynamic = "force-static";

export function GET() {
  return Response.json({ version: APP_VERSION });
}
