import { Code } from '../_lib/ui'
import { DomainSeparatorWidget, HashAttestWidget } from '../_lib/widgets'

const DELEGATED = `// signer — offline, no gas, no chain access
const request = await signet.signDelegatedAttestation({
  schemaUID, subject: '0xSubject…', data: '0x01',
})

// relayer — anywhere else, pays the gas
const { uid } = await signet.submitDelegatedAttestation(request)`

export default function DelegatedPage() {
  return (
    <>
      <h2>Delegated attestation (gasless)</h2>
      <p>
        The attester signs an EIP-712 message offline — no chain access, no gas. A relayer
        submits it and pays. Replay is bounded by a per-attester nonce and a deadline.
      </p>
      <Code>{DELEGATED}</Code>
      <code className="sig">{`signet.signDelegatedAttestation({ schemaUID, subject, data, nonce?, deadline?, expirationTime? })
  → DelegatedAttestationRequest      // { …fields, signature }
signet.submitDelegatedAttestation(request) → { uid, hash }
signet.hashAttest(chainId, registry, request) → Hex               // pure, the digest to sign
signet.computeDomainSeparator(chainId, registry) → Hex            // pure`}</code>
      <HashAttestWidget />
      <DomainSeparatorWidget />
    </>
  )
}
