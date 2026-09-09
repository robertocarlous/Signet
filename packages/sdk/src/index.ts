/**
 * @signetprotocol/sdk
 *
 * Meta-package that provides unified access to the Signet Stellar implementation
 * This package re-exports the Stellar SDK and core types for convenience
 */

// Export Stellar SDK
export * from '@signetprotocol/stellar-sdk'

// Export core types and interfaces
export * from '@signetprotocol/core'

/**
 * Version information
 */
export const SDK_VERSION = '2.0.2'
export const SUPPORTED_CHAINS = ['stellar'] as const
export type ChainType = 'stellar'
