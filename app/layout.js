import './globals.css'

export const metadata = {
  title: 'SOH Match Centre',
  description: 'SOH GAA live match scoreboard'
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
