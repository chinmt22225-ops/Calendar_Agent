import { describe, expect, it } from 'vitest'
import { readableApiDetail, shouldRefreshAuth, shouldRetryApiRequest } from './client'

describe('API retry policy', () => {
  it('retries only safe GET requests for temporary failures', () => {
    expect(shouldRetryApiRequest('get', 503)).toBe(true)
    expect(shouldRetryApiRequest('GET', undefined)).toBe(true)
    expect(shouldRetryApiRequest('post', 503)).toBe(false)
    expect(shouldRetryApiRequest('get', 422)).toBe(false)
    expect(shouldRetryApiRequest('get', undefined, 'ERR_CANCELED')).toBe(false)
  })

  it('refreshes an expired session only once after a 401', () => {
    expect(shouldRefreshAuth(401, false)).toBe(true)
    expect(shouldRefreshAuth(401, true)).toBe(false)
    expect(shouldRefreshAuth(403, false)).toBe(false)
  })
})

describe('API error messages', () => {
  it('turns FastAPI validation details into a readable message', () => {
    expect(readableApiDetail([{ loc: ['body', 'title'], msg: 'Value error, Vui lòng nhập tiêu đề' }]))
      .toBe('Dữ liệu không hợp lệ: Vui lòng nhập tiêu đề')
    expect(readableApiDetail({ unexpected: true })).toBe('Yêu cầu không hợp lệ.')
  })
})
