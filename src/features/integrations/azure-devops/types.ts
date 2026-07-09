// Client-safe shared types for the Azure DevOps integration (no `server-only`).

// An Azure DevOps user identity, used to render @-mention suggestions and to
// build the `data-vss-mention` markup that actually notifies the person in ADO.
export interface AdoIdentity {
  id: string; // identity GUID (localId) → goes into data-vss-mention
  displayName: string;
  mail: string;
}
