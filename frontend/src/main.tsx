import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'temporal-polyfill/global'
import App from './App'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './context/ToastContext'
import './index.css'
import './styles/redesign.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode><BrowserRouter><ThemeProvider><ToastProvider><AuthProvider><App /></AuthProvider></ToastProvider></ThemeProvider></BrowserRouter></StrictMode>,
)
