const root = document.documentElement
const screens = [...document.querySelectorAll('[data-screen]')]
const goButtons = [...document.querySelectorAll('[data-go]')]
const modalLayers = [...document.querySelectorAll('[data-modal]')]
const drawerLayers = [...document.querySelectorAll('[data-drawer]')]

function showScreen(name) {
  screens.forEach((screen) => screen.classList.toggle('active', screen.dataset.screen === name))
  document.querySelectorAll('.prototype-switcher [data-go]').forEach((button) => {
    button.classList.toggle('active', button.dataset.go === name)
  })
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function closeOverlays() {
  ;[...modalLayers, ...drawerLayers].forEach((layer) => {
    layer.classList.remove('open')
    layer.setAttribute('aria-hidden', 'true')
  })
}

function openOverlay(selector) {
  closeOverlays()
  const layer = document.querySelector(selector)
  if (!layer) return
  layer.classList.add('open')
  layer.setAttribute('aria-hidden', 'false')
}

goButtons.forEach((button) => button.addEventListener('click', () => showScreen(button.dataset.go)))

document.querySelectorAll('[data-open]').forEach((button) => button.addEventListener('click', () => {
  const target = button.dataset.open
  if (target === 'trash') openOverlay('[data-drawer="trash"]')
  else openOverlay(`[data-modal="${target}"]`)
}))

document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', closeOverlays))

document.querySelectorAll('.theme-toggle').forEach((button) => button.addEventListener('click', () => {
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark'
}))

document.querySelectorAll('.side-collapse').forEach((button) => button.addEventListener('click', () => {
  document.querySelector('.calendar-layout')?.classList.toggle('side-compact')
}))

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeOverlays()
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
    event.preventDefault()
    document.querySelector('.calendar-layout')?.classList.toggle('side-compact')
  }
})

document.querySelectorAll('.proposal-card .primary').forEach((button) => button.addEventListener('click', () => {
  button.textContent = '✓ Đã áp dụng 6 sự kiện'
  button.disabled = true
}))
