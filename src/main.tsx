import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './index.css'
import App from '@/app/AppShell'
import { AppProviders } from '@/app/providers/AppProviders'
import { resetStaleLocalDataOnce } from '@/app/bootstrap/resetLocalData'

resetStaleLocalDataOnce()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
)
