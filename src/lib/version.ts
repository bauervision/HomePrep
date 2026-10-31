/**
 * Application version, inlined at build time from package.json by
 * next.config.ts (`env.NEXT_PUBLIC_APP_VERSION`). Every on-screen version
 * label reads this one value.
 */
export const APP_VERSION: string = process.env.NEXT_PUBLIC_APP_VERSION ?? "";

export const versionLabel = (v: string = APP_VERSION) => (v ? `v${v}` : "");
