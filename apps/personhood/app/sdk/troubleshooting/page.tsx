export default function TroubleshootingPage() {
  return (
    <>
      <h2>Troubleshooting</h2>
      <table className="api-table">
        <tbody>
          <tr>
            <td>insufficient funds for gas</td>
            <td>
              The account behind your walletClient has no MON. Fund it from{' '}
              <a className="link" href="https://faucet.monad.xyz" target="_blank" rel="noreferrer">
                faucet.monad.xyz
              </a>
              .
            </td>
          </tr>
          <tr>
            <td>walletClient is required for writes</td>
            <td>
              You called a write (attest, registerSchema…) on a client built with only a publicClient. Add a
              walletClient.
            </td>
          </tr>
          <tr>
            <td>unknown chain &quot;…&quot;</td>
            <td>
              The chain option doesn&apos;t match a key in DEPLOYMENTS (currently just monadTestnet). Check for
              typos, or pass addresses directly for a custom deployment.
            </td>
          </tr>
          <tr>
            <td>revert with no clear reason</td>
            <td>
              If the schema has a resolver, its onAttest hook can reject — an unpaid fee, a failed allowlist
              check. Check the resolver contract&apos;s conditions.
            </td>
          </tr>
          <tr>
            <td>delegated attestation rejected as expired</td>
            <td>deadline defaults to &ldquo;never,&rdquo; but a custom one must be a future Unix timestamp.</td>
          </tr>
        </tbody>
      </table>
    </>
  )
}
