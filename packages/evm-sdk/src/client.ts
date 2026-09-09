import {
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
  parseEventLogs,
} from 'viem'
import { attestationRegistryAbi, passkeyAttesterAbi, schemaRegistryAbi } from './abi'
import { DEPLOYMENTS, ZERO_ADDRESS, type DeploymentKey } from './deployments'
import { attestTypedData, computeDomainSeparator, hashAttest, hashRevoke, revokeTypedData } from './eip712'
import { computeAttestationUid, computeSchemaUid } from './uid'
import type {
  AttestArgs,
  Attestation,
  DelegatedAttestationRequest,
  DelegatedRevocationRequest,
  Schema,
  SignetAddresses,
  SignetClientOptions,
  WebAuthnAuth,
} from './types'
import { buildPersonhoodChallenge, credentialId } from './webauthn'

const MAX_UINT64 = (1n << 64n) - 1n

export interface WriteResult {
  hash: Hex
  uid: Hex
}

export class SignetClient {
  readonly chainId: number
  readonly addresses: SignetAddresses
  readonly publicClient: PublicClient
  readonly walletClient?: WalletClient

  constructor(options: SignetClientOptions) {
    this.publicClient = options.publicClient
    this.walletClient = options.walletClient

    if (options.addresses) {
      this.addresses = options.addresses
      this.chainId = options.publicClient.chain?.id ?? 0
    } else {
      const key = (options.chain ?? 'monadTestnet') as DeploymentKey
      const d = DEPLOYMENTS[key]
      if (!d) throw new Error(`SignetClient: unknown chain "${String(key)}"`)
      this.addresses = d.addresses as SignetAddresses
      this.chainId = d.chainId
    }
  }

  // ------------------------------------------------------------------ helpers

  private write() {
    if (!this.walletClient) throw new Error('SignetClient: a walletClient is required for writes')
    const account = this.walletClient.account as Account | undefined
    if (!account) throw new Error('SignetClient: walletClient has no account')
    return { wallet: this.walletClient, account, chain: this.walletClient.chain as Chain | undefined }
  }

  /** Pure — `SignetUID.schemaUID`. */
  computeSchemaUid(input: { definition: string; authority: Address; resolver?: Address; revocable: boolean }): Hex {
    return computeSchemaUid({ ...input, resolver: input.resolver ?? ZERO_ADDRESS })
  }

  /** Pure — `SignetUID.attestationUID`. */
  computeAttestationUid(input: { schemaUID: Hex; subject: Address; attester: Address; nonce: bigint }): Hex {
    return computeAttestationUid({ registry: this.addresses.attestationRegistry, ...input })
  }

  /** Pure — the bytes a passkey must sign to enrol `subject`. */
  personhoodChallenge(subject: Address, x: bigint, y: bigint): Hex {
    const attester = this.addresses.passkeyAttester
    if (!attester) throw new Error('SignetClient: no passkeyAttester address for this chain')
    return buildPersonhoodChallenge({ chainId: this.chainId, passkeyAttester: attester, subject, x, y })
  }

  // -------------------------------------------------------------------- reads

  async getSchema(uid: Hex): Promise<Schema> {
    return (await this.publicClient.readContract({
      address: this.addresses.schemaRegistry,
      abi: schemaRegistryAbi,
      functionName: 'getSchema',
      args: [uid],
    })) as Schema
  }

  isSchemaRegistered(uid: Hex): Promise<boolean> {
    return this.publicClient.readContract({
      address: this.addresses.schemaRegistry,
      abi: schemaRegistryAbi,
      functionName: 'isRegistered',
      args: [uid],
    }) as Promise<boolean>
  }

  async getAttestation(uid: Hex): Promise<Attestation> {
    return (await this.publicClient.readContract({
      address: this.addresses.attestationRegistry,
      abi: attestationRegistryAbi,
      functionName: 'getAttestation',
      args: [uid],
    })) as Attestation
  }

  isValid(uid: Hex): Promise<boolean> {
    return this.publicClient.readContract({
      address: this.addresses.attestationRegistry,
      abi: attestationRegistryAbi,
      functionName: 'isValid',
      args: [uid],
    }) as Promise<boolean>
  }

  async getNonce(attester: Address): Promise<bigint> {
    return BigInt(
      (await this.publicClient.readContract({
        address: this.addresses.attestationRegistry,
        abi: attestationRegistryAbi,
        functionName: 'getNonce',
        args: [attester],
      })) as bigint
    )
  }

  async getRevocationNonce(revoker: Address): Promise<bigint> {
    return BigInt(
      (await this.publicClient.readContract({
        address: this.addresses.attestationRegistry,
        abi: attestationRegistryAbi,
        functionName: 'getRevocationNonce',
        args: [revoker],
      })) as bigint
    )
  }

  /** On-chain `DOMAIN_SEPARATOR()`. */
  onchainDomainSeparator(): Promise<Hex> {
    return this.publicClient.readContract({
      address: this.addresses.attestationRegistry,
      abi: attestationRegistryAbi,
      functionName: 'DOMAIN_SEPARATOR',
    }) as Promise<Hex>
  }

  /** Locally computed domain separator (should equal {@link onchainDomainSeparator}). */
  domainSeparator(): Hex {
    return computeDomainSeparator(this.chainId, this.addresses.attestationRegistry)
  }

  /** The personhood attestation UID for `subject`, or the zero hash. */
  personhoodOf(subject: Address): Promise<Hex> {
    if (!this.addresses.passkeyAttester) throw new Error('SignetClient: no passkeyAttester for this chain')
    return this.publicClient.readContract({
      address: this.addresses.passkeyAttester,
      abi: passkeyAttesterAbi,
      functionName: 'personhoodOf',
      args: [subject],
    }) as Promise<Hex>
  }

  // ------------------------------------------------------------------- writes

  async registerSchema(args: { definition: string; resolver?: Address; revocable: boolean }): Promise<WriteResult> {
    const { wallet, account, chain } = this.write()
    const resolver = args.resolver ?? ZERO_ADDRESS
    const hash = await wallet.writeContract({
      address: this.addresses.schemaRegistry,
      abi: schemaRegistryAbi,
      functionName: 'register',
      args: [args.definition, resolver, args.revocable],
      account,
      chain,
    })
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash })
    const [ev] = parseEventLogs({ abi: schemaRegistryAbi, logs: receipt.logs, eventName: 'SchemaRegistered' })
    const uid =
      (ev?.args as { uid?: Hex } | undefined)?.uid ?? this.computeSchemaUid({ ...args, authority: account.address })
    return { hash, uid }
  }

  async attest(args: AttestArgs): Promise<WriteResult> {
    const { wallet, account, chain } = this.write()
    const expirationTime = args.expirationTime ?? 0n
    const hash = await wallet.writeContract({
      address: this.addresses.attestationRegistry,
      abi: attestationRegistryAbi,
      functionName: 'attest',
      args: [{ schemaUID: args.schemaUID, subject: args.subject, expirationTime, data: args.data }],
      account,
      chain,
    })
    return { hash, uid: await this.#uidFromAttestedLog(hash) }
  }

  async revoke(attestationUID: Hex): Promise<{ hash: Hex }> {
    const { wallet, account, chain } = this.write()
    const hash = await wallet.writeContract({
      address: this.addresses.attestationRegistry,
      abi: attestationRegistryAbi,
      functionName: 'revoke',
      args: [{ attestationUID }],
      account,
      chain,
    })
    await this.publicClient.waitForTransactionReceipt({ hash })
    return { hash }
  }

  // ---------------------------------------------------------- delegated (EIP-712)

  /**
   * Sign a delegated attestation with the wallet's account. Returns a request
   * ready to hand to a relayer / {@link submitDelegatedAttestation}.
   */
  async signDelegatedAttestation(args: {
    schemaUID: Hex
    subject: Address
    data: Hex
    attester?: Address
    nonce?: bigint
    deadline?: bigint
    expirationTime?: bigint
  }): Promise<DelegatedAttestationRequest> {
    const { wallet, account } = this.write()
    const attester = args.attester ?? account.address
    const nonce = args.nonce ?? (await this.getNonce(attester))
    const deadline = args.deadline ?? MAX_UINT64
    const expirationTime = args.expirationTime ?? 0n
    const base = {
      schemaUID: args.schemaUID,
      subject: args.subject,
      attester,
      nonce,
      deadline,
      expirationTime,
      data: args.data,
    }
    const signature = await wallet.signTypedData({
      ...attestTypedData(this.chainId, this.addresses.attestationRegistry, base),
      account,
    })
    return { ...base, signature }
  }

  async signDelegatedRevocation(args: {
    attestationUID: Hex
    revoker?: Address
    nonce?: bigint
    deadline?: bigint
  }): Promise<DelegatedRevocationRequest> {
    const { wallet, account } = this.write()
    const revoker = args.revoker ?? account.address
    const nonce = args.nonce ?? (await this.getRevocationNonce(revoker))
    const deadline = args.deadline ?? MAX_UINT64
    const base = { attestationUID: args.attestationUID, revoker, nonce, deadline }
    const signature = await wallet.signTypedData({
      ...revokeTypedData(this.chainId, this.addresses.attestationRegistry, base),
      account,
    })
    return { ...base, signature }
  }

  /** Relay a signed delegated attestation (the caller pays gas). */
  async submitDelegatedAttestation(request: DelegatedAttestationRequest): Promise<WriteResult> {
    const { wallet, account, chain } = this.write()
    const hash = await wallet.writeContract({
      address: this.addresses.attestationRegistry,
      abi: attestationRegistryAbi,
      functionName: 'attestByDelegation',
      args: [request],
      account,
      chain,
    })
    return { hash, uid: await this.#uidFromAttestedLog(hash) }
  }

  async submitDelegatedRevocation(request: DelegatedRevocationRequest): Promise<{ hash: Hex }> {
    const { wallet, account, chain } = this.write()
    const hash = await wallet.writeContract({
      address: this.addresses.attestationRegistry,
      abi: attestationRegistryAbi,
      functionName: 'revokeByDelegation',
      args: [request],
      account,
      chain,
    })
    await this.publicClient.waitForTransactionReceipt({ hash })
    return { hash }
  }

  /** Local digest for a delegated attestation (parity with on-chain `hashDelegatedAttestation`). */
  hashDelegatedAttestation(request: Omit<DelegatedAttestationRequest, 'signature'>): Hex {
    return hashAttest(this.chainId, this.addresses.attestationRegistry, request)
  }

  hashDelegatedRevocation(request: Omit<DelegatedRevocationRequest, 'signature'>): Hex {
    return hashRevoke(this.chainId, this.addresses.attestationRegistry, request)
  }

  // ------------------------------------------------------------ passkey personhood

  /**
   * Verify a passkey assertion on chain and mint a personhood attestation for `subject`.
   * `auth` comes from {@link toWebAuthnAuth} / {@link assertionFromCredential}.
   */
  async attestPersonhood(args: { subject: Address; x: bigint; y: bigint; auth: WebAuthnAuth }): Promise<WriteResult> {
    const { wallet, account, chain } = this.write()
    const attester = this.addresses.passkeyAttester
    if (!attester) throw new Error('SignetClient: no passkeyAttester address for this chain')
    const hash = await wallet.writeContract({
      address: attester,
      abi: passkeyAttesterAbi,
      functionName: 'attestPersonhood',
      args: [args.subject, args.x, args.y, args.auth],
      account,
      chain,
    })
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash })
    const [ev] = parseEventLogs({ abi: passkeyAttesterAbi, logs: receipt.logs, eventName: 'PersonhoodAttested' })
    const uid = (ev?.args as { attestationUID?: Hex } | undefined)?.attestationUID
    return { hash, uid: uid ?? '0x' }
  }

  /** `keccak256(abi.encode(x, y))` — a passkey's credential id in `PasskeyAttester`. */
  credentialId(x: bigint, y: bigint): Hex {
    return credentialId(x, y)
  }

  // --------------------------------------------------------------------- internal

  async #uidFromAttestedLog(hash: Hex): Promise<Hex> {
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash })
    const [ev] = parseEventLogs({ abi: attestationRegistryAbi, logs: receipt.logs, eventName: 'Attested' })
    const uid = (ev?.args as { uid?: Hex } | undefined)?.uid
    if (!uid) throw new Error('attest: no Attested event in receipt')
    return uid
  }
}
