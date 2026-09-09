import { describe, expect, it } from 'vitest'
import { keccak256, stringToHex } from 'viem'
import {
  MONAD_TESTNET,
  MONAD_TESTNET_CHAIN_ID,
  buildPersonhoodChallenge,
  computeAttestationUid,
  computeDomainSeparator,
  computeSchemaUid,
  derSignatureToRS,
  PERSONHOOD_CHALLENGE_DOMAIN,
} from '../src/index'

// Values captured from the live Monad-testnet deployment (chain 10143).
const DEPLOYER = '0x1780df035b6D25138D729351aF85278d3A719fcD' as const

describe('UID parity with contracts/evm', () => {
  it('computeSchemaUid reproduces the on-chain personhood schema UID', () => {
    const definition =
      '{"name":"proof-of-personhood","version":"1","description":"Holder controls a WebAuthn passkey; one attestation per credential.","fields":[{"name":"pubKeyX","type":"uint256"},{"name":"pubKeyY","type":"uint256"}]}'

    const uid = computeSchemaUid({
      definition,
      authority: DEPLOYER,
      resolver: MONAD_TESTNET.personhoodResolver!,
      revocable: true,
    })

    expect(uid).toBe('0x6e29449805b2f822cdbaea9ca4bbc8758addb90d9ac2206e6d6156a51cac74e4')
  })

  it('computeAttestationUid reproduces the on-chain passkey personhood attestation UID', () => {
    const uid = computeAttestationUid({
      registry: MONAD_TESTNET.attestationRegistry,
      schemaUID: MONAD_TESTNET.personhoodSchemaUID!,
      subject: DEPLOYER,
      attester: MONAD_TESTNET.passkeyAttester!, // PasskeyAttester is the on-chain attester
      nonce: 0n,
    })

    expect(uid).toBe('0xc659ddadead2cfe70ff0f56e4635c5a841f8afe39d4e606af11c42bcbd9e827a')
  })
})

describe('EIP-712 parity', () => {
  it('computeDomainSeparator matches SignetAttestationRegistry.DOMAIN_SEPARATOR()', () => {
    expect(computeDomainSeparator(MONAD_TESTNET_CHAIN_ID, MONAD_TESTNET.attestationRegistry)).toBe(
      '0x79896b7699cae2b833bf06fbc1163ac25f9f9db62a63a7a6d32cee9478318cd0'
    )
  })
})

describe('personhood challenge parity', () => {
  it('PERSONHOOD_CHALLENGE_DOMAIN is keccak256("SIGNET_PERSONHOOD_V1")', () => {
    expect(PERSONHOOD_CHALLENGE_DOMAIN).toBe(keccak256(stringToHex('SIGNET_PERSONHOOD_V1')))
  })

  it('buildPersonhoodChallenge reproduces PasskeyAttester.challenge(subject, 1, 2)', () => {
    // Ground truth: `cast call <PasskeyAttester> "challenge(address,uint256,uint256)(bytes)" <DEPLOYER> 1 2`
    const onChain =
      '0xeca32822cf89bd00c4e8e25f3db71610d531eb5d39907416d51f7a5da5394a1c000000000000000000000000000000000000000000000000000000000000279f0000000000000000000000005a99835d5e7434bbf3e44cc6a3e76b762045c48d0000000000000000000000001780df035b6d25138d729351af85278d3a719fcd00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002'

    const challenge = buildPersonhoodChallenge({
      chainId: MONAD_TESTNET_CHAIN_ID,
      passkeyAttester: MONAD_TESTNET.passkeyAttester!,
      subject: DEPLOYER,
      x: 1n,
      y: 2n,
    })

    expect(challenge.toLowerCase()).toBe(onChain)
  })
})

describe('derSignatureToRS', () => {
  it('decodes DER and normalises to low-s', () => {
    // DER SEQUENCE { INTEGER r=1, INTEGER s=1 }
    const der = '0x3006020101020101'
    const { r, s } = derSignatureToRS(der)
    expect(r).toBe('0x0000000000000000000000000000000000000000000000000000000000000001')
    expect(s).toBe('0x0000000000000000000000000000000000000000000000000000000000000001')
  })

  it('flips a high-s signature below N/2', () => {
    const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n
    const highS = N - 2n // > N/2
    const der = `0x3026020101022100${highS.toString(16).padStart(64, '0')}` as const
    const { s } = derSignatureToRS(der)
    expect(BigInt(s)).toBe(2n)
  })
})
