import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import ServiceWorkerRegistration from './ServiceWorkerRegistration'

export const metadata = {
  title: 'SOH Match Centre',
  description: 'SOH GAA live match scoreboard'
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegistration />
        {children}
    <Analytics />
      </body>
    </html>
  )
}
