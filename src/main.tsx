import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import '@fontsource-variable/noto-sans-sc'
import App from './App'
import { TooltipProvider } from '@/components/ui/tooltip'
import './index.css'
import './motion.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider delayDuration={220} skipDelayDuration={400}>
      <App />
    </TooltipProvider>
  </StrictMode>,
)
