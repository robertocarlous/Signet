import { describe, expect, it } from 'vitest'
import { encodeAbiParameters, hashTypedData, keccak256, stringToHex } from 'viem'
import {
  MONAD_TESTNET,
  MONAD_TESTNET_CHAIN_ID,
  buildPersonhoodChallenge,
  buildRecoveryChallenge,
  buildSetGuardiansChallenge,
  computeAttestationUid,
  computeDomainSeparator,
  computePasskeyDomainSeparator,
  computeSchemaUid,
  derSignatureToRS,
  hashRecover,
  PASSKEY_EIP712_NAME,
  PASSKEY_EIP712_VERSION,
  PERSONHOOD_CHALLENGE_DOMAIN,
  RECOVERY_CHALLENGE_DOMAIN,
  RECOVER_TYPES,
  SET_GUARDIANS_CHALLENGE_DOMAIN,
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

    expect(uid).toBe('0x6171b49bd97f67cab946cc7fe562c49faeb093fdd30ad438f7358b85849a26b6')
  })

  it('computeAttestationUid reproduces the on-chain passkey personhood attestation UID', () => {
    const uid = computeAttestationUid({
      registry: MONAD_TESTNET.attestationRegistry,
      schemaUID: MONAD_TESTNET.personhoodSchemaUID!,
      subject: DEPLOYER,
      attester: MONAD_TESTNET.passkeyAttester!, // PasskeyAttester is the on-chain attester
      nonce: 0n,
    })

    expect(uid).toBe('0xcb9642f3e1dc95d91154123b03d21c9c0046ee1eb5cb02de4b910457844005f6')
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
      '0xeca32822cf89bd00c4e8e25f3db71610d531eb5d39907416d51f7a5da5394a1c000000000000000000000000000000000000000000000000000000000000279f000000000000000000000000ffbcd844da4f5cabba36f60e4f17cefe00029c8a0000000000000000000000001780df035b6d25138d729351af85278d3a719fcd00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002'

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

// NOTE: these check the SDK's internal formulas are self-consistent (right ABI
// shapes, right EIP-712 construction) — the same bar the rest of this file held
// *before* PasskeyAttester's M2 deployment existed to `cast call` against. Once
// the guardians/recovery build is redeployed, replace/extend these with real
// `cast call <PasskeyAttester> ...` ground truth, the way the tests above do.
describe('guardians / recovery challenge construction', () => {
  it('SET_GUARDIANS_CHALLENGE_DOMAIN is keccak256("SIGNET_PERSONHOOD_SET_GUARDIANS_V1")', () => {
    expect(SET_GUARDIANS_CHALLENGE_DOMAIN).toBe(keccak256(stringToHex('SIGNET_PERSONHOOD_SET_GUARDIANS_V1')))
  })

  it('RECOVERY_CHALLENGE_DOMAIN is keccak256("SIGNET_PERSONHOOD_RECOVERY_V1")', () => {
    expect(RECOVERY_CHALLENGE_DOMAIN).toBe(keccak256(stringToHex('SIGNET_PERSONHOOD_RECOVERY_V1')))
  })

  it('buildSetGuardiansChallenge matches manual abi.encode(domain, chainId, attester, subject, keccak256(abi.encode(guardians, threshold)), nonce)', () => {
    const guardians = ['0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222'] as const
    const threshold = 2
    const nonce = 0n

    const guardiansHash = keccak256(
      encodeAbiParameters([{ type: 'address[]' }, { type: 'uint8' }], [[...guardians], threshold])
    )
    const expected = encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'uint256' },
        { type: 'address' },
        { type: 'address' },
        { type: 'bytes32' },
        { type: 'uint256' },
      ],
      [SET_GUARDIANS_CHALLENGE_DOMAIN, BigInt(MONAD_TESTNET_CHAIN_ID), MONAD_TESTNET.passkeyAttester!, DEPLOYER, guardiansHash, nonce]
    )

    expect(
      buildSetGuardiansChallenge({
        chainId: MONAD_TESTNET_CHAIN_ID,
        passkeyAttester: MONAD_TESTNET.passkeyAttester!,
        subject: DEPLOYER,
        guardians: [...guardians],
        threshold,
        nonce,
      })
    ).toBe(expected)
  })

  it('buildRecoveryChallenge matches manual abi.encode(domain, chainId, attester, subject, newX, newY, nonce)', () => {
    const expected = encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'uint256' },
        { type: 'address' },
        { type: 'address' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'uint256' },
      ],
      [RECOVERY_CHALLENGE_DOMAIN, BigInt(MONAD_TESTNET_CHAIN_ID), MONAD_TESTNET.passkeyAttester!, DEPLOYER, 1n, 2n, 0n]
    )

    expect(
      buildRecoveryChallenge({
        chainId: MONAD_TESTNET_CHAIN_ID,
        passkeyAttester: MONAD_TESTNET.passkeyAttester!,
        subject: DEPLOYER,
        newX: 1n,
        newY: 2n,
        nonce: 0n,
      })
    ).toBe(expected)
  })
})

describe('guardian recovery EIP-712 (PasskeyAttester domain)', () => {
  it('computePasskeyDomainSeparator returns a well-formed bytes32 for the deployed attester', () => {
    expect(computePasskeyDomainSeparator(MONAD_TESTNET_CHAIN_ID, MONAD_TESTNET.passkeyAttester!)).toMatch(
      /^0x[0-9a-f]{64}$/
    )
  })

  it('hashRecover agrees with viem hashTypedData over the same domain/types/message', () => {
    const chainId = MONAD_TESTNET_CHAIN_ID
    const verifyingContract = MONAD_TESTNET.passkeyAttester!
    const message = { subject: DEPLOYER, newX: 1n, newY: 2n, nonce: 0n, deadline: 9999999999n }

    const expected = hashTypedData({
      domain: { name: PASSKEY_EIP712_NAME, version: PASSKEY_EIP712_VERSION, chainId, verifyingContract },
      types: RECOVER_TYPES,
      primaryType: 'Recover',
      message,
    })

    expect(hashRecover(chainId, verifyingContract, message)).toBe(expected)
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
