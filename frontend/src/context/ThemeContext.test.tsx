import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ThemeProvider, useTheme } from './ThemeContext'

function ThemeProbe() {
  const { preference, theme, setPreference, toggleTheme } = useTheme()
  return <>
    <output>{`${preference}:${theme}`}</output>
    <button onClick={() => setPreference('dark')}>dark</button>
    <button onClick={toggleTheme}>toggle</button>
  </>
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
  })

  it('defaults to the system preference and applies it to the document', () => {
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>)
    expect(screen.getByText('system:light')).toBeInTheDocument()
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('persists explicit choices and toggles the resolved theme', () => {
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>)
    fireEvent.click(screen.getByText('dark'))
    expect(screen.getByText('dark:dark')).toBeInTheDocument()
    expect(localStorage.getItem('planora-theme')).toBe('dark')
    fireEvent.click(screen.getByText('toggle'))
    expect(screen.getByText('light:light')).toBeInTheDocument()
    expect(localStorage.getItem('planora-theme')).toBe('light')
  })
})
