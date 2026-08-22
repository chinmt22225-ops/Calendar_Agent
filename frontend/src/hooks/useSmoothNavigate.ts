import { useCallback } from 'react'
import { flushSync } from 'react-dom'
import { type To, useLocation, useNavigate } from 'react-router-dom'

type TransitionDocument = Document & {
  startViewTransition?: (update: () => void) => void
}

export function useSmoothNavigate() {
  const navigate = useNavigate()
  const location = useLocation()

  return useCallback((to: To) => {
    if (typeof to === 'string' && to === location.pathname) return

    const transitionDocument = document as TransitionDocument
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!transitionDocument.startViewTransition || reduceMotion) {
      navigate(to)
      return
    }

    transitionDocument.startViewTransition(() => {
      flushSync(() => navigate(to))
    })
  }, [location.pathname, navigate])
}
