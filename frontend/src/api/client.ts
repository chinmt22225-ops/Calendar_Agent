import axios, { type InternalAxiosRequestConfig } from 'axios'
import { supabase } from '../lib/supabase'

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _planoraRetryCount?: number
  _planoraAuthRetry?: boolean
}

export function readableApiDetail(detail: unknown) {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const first = detail.find((item) => item && typeof item === 'object' && typeof item.msg === 'string')
    if (first?.msg) return `Dữ liệu không hợp lệ: ${String(first.msg).replace(/^Value error,\s*/i, '')}`
  }
  return 'Yêu cầu không hợp lệ.'
}

export function shouldRetryApiRequest(method?: string, status?: number, code?: string) {
  if (code === 'ERR_CANCELED' || method?.toLowerCase() !== 'get') return false
  return status === undefined || [502, 503, 504].includes(status)
}

export function shouldRefreshAuth(status?: number, alreadyRetried = false) {
  return status === 401 && !alreadyRetried
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api',
  timeout: 30000,
})

api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession()
  if (data.session?.access_token) {
    config.headers.Authorization = `Bearer ${data.session.access_token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error?.config as RetryableRequestConfig | undefined
    const status = error?.response?.status as number | undefined
    if (config && shouldRefreshAuth(status, Boolean(config._planoraAuthRetry))) {
      config._planoraAuthRetry = true
      const { data, error: refreshError } = await supabase.auth.refreshSession()
      if (!refreshError && data.session?.access_token) {
        config.headers.Authorization = `Bearer ${data.session.access_token}`
        return api(config)
      }
    }
    if (config && shouldRetryApiRequest(config.method, status, error?.code)) {
      const attempt = config._planoraRetryCount ?? 0
      if (attempt < 2) {
        config._planoraRetryCount = attempt + 1
        await new Promise((resolve) => window.setTimeout(resolve, attempt === 0 ? 300 : 800))
        return api(config)
      }
    }
    const detail = error?.response?.data?.detail
    const requestId = error?.response?.data?.request_id || error?.response?.headers?.['x-request-id']
    if (detail) {
      const cleanDetail = readableApiDetail(detail)
      error.message = requestId && status && status >= 500
        ? `${cleanDetail} Mã hỗ trợ: ${requestId}.`
        : cleanDetail
    }
    if (requestId) error.requestId = requestId
    return Promise.reject(error)
  },
)

export async function getAccessToken() {
  const { data } = await supabase.auth.getSession()
  const session = data.session
  if (session?.expires_at && session.expires_at <= Math.floor(Date.now() / 1000) + 30) {
    const refreshed = await supabase.auth.refreshSession()
    return refreshed.data.session?.access_token ?? ''
  }
  return session?.access_token ?? ''
}
