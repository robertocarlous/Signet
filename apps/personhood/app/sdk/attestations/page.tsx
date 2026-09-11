import { AttestationUidWidget } from '../_lib/widgets'

export default function AttestationsPage() {
  return (
    <>
      <h2>Attestations</h2>
      <p>
        A signed claim about a <code>subject</code>, structured by a schema. <code>data</code> is
        ABI-encoded per the schema. The UID binds the registry and attester so it never collides.
      </p>
      <p>Three ways to write one — pick by who pays gas and whether the attester is online:</p>
      <div className="fits">
        <div className="box">
          <b>attest()</b> — the attester (<code>msg.sender</code>) pays gas and must be online. Simplest case:
          you hold the live, funded wallet. Runs server-side (see Quickstart).
        </div>
        <div className="box">
          <b>signDelegatedAttestation() + submitDelegatedAttestation()</b> — the attester signs offline once,
          no gas; whoever relays it pays. Use when the attester shouldn&apos;t need gas or a connection —
          see <a className="link" href="/sdk/delegated">Delegated</a>.
        </div>
        <div className="box">
          <b>attestPersonhood()</b> — a device passkey signs; whoever relays it pays. Use to prove a real
          device/human holder, with no wallet or seed phrase — see{' '}
          <a className="link" href="/sdk/personhood">Passkey personhood</a>.
        </div>
      </div>
      <code className="sig">{`signet.attest({ schemaUID, subject, data, expirationTime? }) → { uid, hash }
signet.revoke(attestationUID) → { hash }              // attester only, schema must be revocable
signet.getAttestation(uid) → Attestation
signet.isValid(uid) → boolean                         // exists, not revoked, not expired
signet.computeAttestationUid({ schemaUID, subject, attester, nonce }) → Hex   // pure`}</code>
      <AttestationUidWidget />
    </>
  )
}
