export default function manifest() {
  return {
    id: '/live',
    name: 'SOH Match Centre',
    short_name: 'SOH Match Centre',
    description: 'SOH GAA live match scoreboard',
    start_url: '/live',
    scope: '/',
    display: 'standalone',
    background_color: '#071a12',
    theme_color: '#071a12',
    icons: [
      {
        src: '/soh-match-centre-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/soh-match-centre-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any'
      }
    ]
  }
}
