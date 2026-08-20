import axios from 'axios'
import { supabase } from '../lib/supabase'

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

export async function getAccessToken() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? ''
}

