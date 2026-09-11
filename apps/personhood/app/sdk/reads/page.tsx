export default function ReadsPage() {
  return (
    <>
      <h2>Reads &amp; verification</h2>
      <p>
        All reads are permissionless — no API key, and safe to run straight from the browser (no
        private key involved, see <a className="link" href="/sdk/live">Live demo</a>). For a hosted
        HTTP surface (list attestations, filter by subject/schema, personhood lookup) the indexer
        exposes{' '}
        <a className="link" href="/api/monad/contracts" target="_blank" rel="noreferrer">
          /api/monad
        </a>
        .
      </p>
      <code className="sig">{`signet.getSchema(uid) · signet.isSchemaRegistered(uid)
signet.getAttestation(uid) · signet.isValid(uid) · signet.isAttested(uid)
signet.getNonce(attester) · signet.getRevocationNonce(revoker)
signet.onchainDomainSeparator() · signet.personhoodOf(address)`}</code>
    </>
  )
}
