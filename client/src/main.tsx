import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Logos and photos are organizer-supplied URLs that can go dead. Hide a failed
// image instead of showing the browser's broken-image glyph; every avatar and
// logo sits in a styled frame, so the frame reads as an empty placeholder.
// Error events don't bubble, hence the capture-phase listener.
document.addEventListener('error', event => {
  if (event.target instanceof HTMLImageElement) event.target.style.visibility = 'hidden'
}, true)
document.addEventListener('load', event => {
  if (event.target instanceof HTMLImageElement) event.target.style.visibility = ''
}, true)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
