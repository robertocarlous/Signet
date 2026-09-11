import { SchemaUidWidget } from '../_lib/widgets'

export default function SchemasPage() {
  return (
    <>
      <h2>Schemas</h2>
      <p>
        A schema is a reusable definition other people&apos;s attestations reference. Registering
        is a permissionless transaction (from your backend — see <a className="link" href="/sdk">Quickstart</a>);
        the UID is deterministic, so integrators can hard-code it.
      </p>
      <code className="sig">{`signet.registerSchema({ definition: string, revocable: boolean, resolver?: Address })
  → { uid: Hex, hash: Hex }
signet.getSchema(uid: Hex) → { authority, resolver, revocable, definition }
signet.computeSchemaUid({ definition, authority, resolver?, revocable }) → Hex   // pure`}</code>
      <SchemaUidWidget />
    </>
  )
}
