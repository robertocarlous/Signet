export default function HowItFitsPage() {
  return (
    <>
      <h2>How it fits together</h2>
      <p>Four terms cover the whole SDK surface:</p>
      <table className="api-table">
        <tbody>
          <tr>
            <td>Schema</td>
            <td>
              The shape of a claim, e.g. &ldquo;bool verified,string level&rdquo;. Anyone can register one; the
              registrant becomes its authority. Registering returns a deterministic schemaUID.
            </td>
          </tr>
          <tr>
            <td>Attestation</td>
            <td>
              One instance of a claim — &ldquo;using schema X, I (the attester) claim this about subject.&rdquo;
              Returns a per-claim uid.
            </td>
          </tr>
          <tr>
            <td>Subject</td>
            <td>The address a claim is about. It never has to sign anything or be online.</td>
          </tr>
          <tr>
            <td>Resolver</td>
            <td>
              An optional contract a schema points at to add rules — fees, allowlists, one-per-address. Most
              quickstart use needs none.
            </td>
          </tr>
        </tbody>
      </table>
      <p style={{ marginTop: 18 }}>
        Underneath: three immutable contracts, no admin keys. The SDK is a typed wrapper over them.
      </p>
      <div className="fits">
        <div className="box">
          <b>SchemaRegistry</b> — permissionless. Anyone registers a <em>schema</em> (a
          definition string); the registrant is its authority. Points optionally at a resolver.
        </div>
        <div className="box">
          <b>AttestationRegistry</b> — <em>attestations</em> structured by a schema.
          Direct (<code>msg.sender</code> is the attester) or delegated (EIP-712 signature, anyone relays).
          Per-attester nonces allow many attestations per (schema, subject).
        </div>
        <div className="box">
          <b>Resolver</b> (optional) — a contract the registry calls on every attest/revoke.
          <code>onAttest</code>/<code>onRevoke</code> are hard gates; <code>onResolve</code> is a
          best-effort hook. This is where fees, allowlists, and one-per-human rules live.
        </div>
        <div className="box">
          <b>PasskeyAttester</b> — verifies a WebAuthn/P-256 assertion on chain (RIP-7212
          precompile) and writes a personhood attestation. Locked to its schema by a resolver.
        </div>
      </div>
    </>
  )
}
