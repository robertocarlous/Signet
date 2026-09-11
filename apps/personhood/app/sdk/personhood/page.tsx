import { Code } from '../_lib/ui'
import { DerToRsWidget, ParsePubKeyWidget, PersonhoodChallengeWidget } from '../_lib/widgets'

const PERSONHOOD = `import { parseP256PublicKey, assertionFromCredential } from '@signetprotocol/evm-sdk'

// on registration: read the passkey's P-256 key once
const { x, y } = parseP256PublicKey(regResponse.getPublicKey())

// the challenge the passkey must sign (== PasskeyAttester.challenge on chain)
const challenge = signet.personhoodChallenge(subject, x, y)

// browser: navigator.credentials.get({ publicKey: { challenge: hexToBytes(challenge), … } })
const auth = assertionFromCredential(assertion)          // -> WebAuthnAuth tuple

// relay it — verified on chain via the RIP-7212 P-256 precompile
const { uid } = await signet.attestPersonhood({ subject, x, y, auth })`

export default function PersonhoodPage() {
  return (
    <>
      <h2>Passkey proof of personhood</h2>
      <p>
        A person proves control of a device passkey (Face&nbsp;ID / fingerprint / security key).
        The WebAuthn assertion is verified <em>on chain</em> by <code>PasskeyAttester</code> via
        the RIP-7212 P-256 precompile, which then writes a personhood attestation. One enrolment per
        passkey, one attestation per subject, and anyone can relay — the person pays nothing.
      </p>
      <p className="note">
        <code>parseP256PublicKey</code> and <code>assertionFromCredential</code> run in the{' '}
        <strong>browser</strong> (they read from WebAuthn APIs). <code>attestPersonhood</code> — the
        write — runs on your <strong>backend</strong>, same as the Quickstart client, because it needs
        the relayer&apos;s key to pay gas.
      </p>
      <Code>{PERSONHOOD}</Code>
      <code className="sig">{`signet.personhoodChallenge(subject, x, y) → Hex        // == PasskeyAttester.challenge on chain
signet.attestPersonhood({ subject, x, y, auth: WebAuthnAuth }) → { uid, hash }
signet.personhoodOf(address) → Hex                     // attestation UID, or bytes32(0)

parseP256PublicKey(spki) → { x, y }                    // from credential.getPublicKey()
assertionFromCredential(cred) → WebAuthnAuth           // from navigator.credentials.get()
buildPersonhoodChallenge({ chainId, passkeyAttester, subject, x, y }) → Hex
derSignatureToRS(der) → { r, s }                       // low-s`}</code>
      <PersonhoodChallengeWidget />
      <ParsePubKeyWidget />
      <DerToRsWidget />
      <p className="note" style={{ marginTop: 14 }}>
        See it run end to end on the <a className="link" href="/">Enrol</a> page.
      </p>
    </>
  )
}
