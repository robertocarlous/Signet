/**
 * @signetprotocol/core
 *
 * Core abstractions and interfaces for Signet SDKs
 * This package provides the foundation for all chain-specific implementations
 */

// Export all types
export * from './types'

// Export all interfaces
export * from './interfaces'

// Export base classes
export * from './base'

// Re-export commonly used items for convenience
export {
  type SignetProtocolResponse,
  type Authority,
  type Schema,
  type Attestation,
  type SchemaDefinition,
  type AttestationDefinition,
  type RevocationDefinition,
  SignetProtocolErrorType,
  createSuccessResponse,
  createErrorResponse,
  createSignetProtocolError,
} from './types'

export {
  type ISignetProtocol,
  type IProtocolConfig,
  type IBatchOperations,
  type IOffChainOperations,
  type IEventListener,
} from './interfaces'

export { SignetProtocolBase, BatchSignetProtocol, OffChainSignetProtocol, EventListenerSignetProtocol } from './base'
