// ponytail: "server-only" isn't installed as a dependency (it's a no-op marker
// package Next.js normally provides). Vitest aliases imports of it to this empty
// file so server-only modules can be unit tested outside the Next build.
export {};
