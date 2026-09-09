import { describe, it, expect } from 'vitest'
import {
  createSuccessResponse,
  createErrorResponse,
  createSignetProtocolError,
  SignetProtocolErrorType
} from '../src/types'

describe('Core Types', () => {
  describe('SignetSDKResponse helpers', () => {
    it('should create success response correctly', () => {
      const data = { test: 'value' }
      const response = createSuccessResponse(data)
      
      expect(response.data).toEqual(data)
      expect(response.error).toBeUndefined()
    })

    it('should create error response correctly', () => {
      const error = new Error('Test error')
      const response = createErrorResponse(error)
      
      expect(response.data).toBeUndefined()
      expect(response.error).toBe(error)
    })
  })

  describe('SignetProtocolError creation', () => {
    it('should create structured error correctly', () => {
      const error = createSignetProtocolError(
        SignetProtocolErrorType.VALIDATION_ERROR,
        'Test message',
        { extra: 'data' },
        'TEST_CODE'
      )

      expect(error.type).toBe(SignetProtocolErrorType.VALIDATION_ERROR)
      expect(error.message).toBe('Test message')
      expect(error.details).toEqual({ extra: 'data' })
      expect(error.code).toBe('TEST_CODE')
    })

    it('should create error with minimal parameters', () => {
      const error = createSignetProtocolError(
        SignetProtocolErrorType.NETWORK_ERROR,
        'Network failed'
      )

      expect(error.type).toBe(SignetProtocolErrorType.NETWORK_ERROR)
      expect(error.message).toBe('Network failed')
      expect(error.details).toBeUndefined()
      expect(error.code).toBeUndefined()
    })
  })
})