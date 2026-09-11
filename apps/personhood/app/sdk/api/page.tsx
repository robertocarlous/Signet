export default function ApiPage() {
  return (
    <>
      <h2>API reference</h2>
      <table className="api-table">
        <tbody>
          <tr><td>new SignetClient(opts)</td><td>{'{ chain | addresses, publicClient, walletClient? }'}</td></tr>
          <tr><td>.registerSchema()</td><td>register a schema → {'{ uid, hash }'}</td></tr>
          <tr><td>.getSchema() / .isSchemaRegistered()</td><td>read a schema</td></tr>
          <tr><td>.attest() / .revoke()</td><td>direct write; revoke is attester-only</td></tr>
          <tr><td>.signDelegatedAttestation()</td><td>EIP-712 sign offline → request object</td></tr>
          <tr><td>.submitDelegatedAttestation()</td><td>relay a signed request</td></tr>
          <tr><td>.signDelegatedRevocation() / .submitDelegatedRevocation()</td><td>same, for revocation</td></tr>
          <tr><td>.getAttestation() / .isValid() / .isAttested()</td><td>read an attestation</td></tr>
          <tr><td>.getNonce() / .getRevocationNonce()</td><td>current nonces</td></tr>
          <tr><td>.attestPersonhood() / .personhoodOf() / .personhoodChallenge()</td><td>passkey personhood</td></tr>
          <tr><td>.computeSchemaUid() / .computeAttestationUid()</td><td>pure UID derivation</td></tr>
          <tr><td>.hashDelegatedAttestation() / .hashDelegatedRevocation()</td><td>pure EIP-712 digests</td></tr>
          <tr><td>.domainSeparator() / .onchainDomainSeparator()</td><td>local vs on-chain</td></tr>
          <tr><td>computeSchemaUid / computeAttestationUid / computeDomainSeparator</td><td>standalone pure exports</td></tr>
          <tr><td>hashAttest / hashRevoke / attestTypedData / revokeTypedData</td><td>EIP-712 building blocks</td></tr>
          <tr><td>buildPersonhoodChallenge / credentialId</td><td>personhood, standalone</td></tr>
          <tr><td>parseP256PublicKey / derSignatureToRS / toWebAuthnAuth / assertionFromCredential</td><td>WebAuthn helpers</td></tr>
          <tr><td>DEPLOYMENTS / MONAD_TESTNET / getDeployment()</td><td>deployed addresses</td></tr>
        </tbody>
      </table>
    </>
  )
}
