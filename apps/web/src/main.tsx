import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { config } from '@fortawesome/fontawesome-svg-core'
import '@fortawesome/fontawesome-svg-core/styles.css'
import '@fontsource-variable/inter'
import './styles.css'
import { TooltipProvider } from './components/ui/tooltip.js'
import { App } from './App.js'
import { applyCachedAppearance } from './lib/appearance.js'

config.autoAddCss = false
applyCachedAppearance()

createRoot(document.getElementById('root')!).render(<StrictMode><TooltipProvider delayDuration={350}><App /></TooltipProvider></StrictMode>)
