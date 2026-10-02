function fitText(context, text, maxWidth, startingSize, weight = 900) {
  let size = startingSize
  do {
    context.font = `${weight} ${size}px Arial, sans-serif`
    if (context.measureText(text).width <= maxWidth) return size
    size -= 2
  } while (size > 28)
  return size
}

export function downloadResultGraphic({
  competition,
  homeName,
  awayName,
  homeGoals,
  homePoints,
  awayGoals,
  awayPoints,
  countyFinalMode = false,
  sohWon = false
}) {
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1080
  const context = canvas.getContext('2d')

  const gradient = context.createLinearGradient(0, 0, 1080, 1080)
  gradient.addColorStop(0, '#04150e')
  gradient.addColorStop(0.62, '#0b2b1d')
  gradient.addColorStop(1, countyFinalMode ? '#6f5308' : '#123524')
  context.fillStyle = gradient
  context.fillRect(0, 0, 1080, 1080)

  context.strokeStyle = '#f4c430'
  context.lineWidth = 7
  context.strokeRect(32, 32, 1016, 1016)

  context.textAlign = 'center'
  context.fillStyle = '#f4c430'
  context.font = '900 34px Arial, sans-serif'
  context.fillText("SEÁN O'HESLIN'S GAA", 540, 105)

  context.fillStyle = '#ffffff'
  context.font = '900 64px Arial, sans-serif'
  context.fillText(countyFinalMode ? 'COUNTY FINAL' : 'FINAL RESULT', 540, 185)
  context.fillStyle = '#c9d4cd'
  fitText(context, competition || 'SOH MATCH CENTRE', 890, 34, 700)
  context.fillText(competition || 'SOH MATCH CENTRE', 540, 240)

  const homeScore = `${Number(homeGoals) || 0}-${String(Number(homePoints) || 0).padStart(2, '0')}`
  const awayScore = `${Number(awayGoals) || 0}-${String(Number(awayPoints) || 0).padStart(2, '0')}`
  const homeTotal = (Number(homeGoals) || 0) * 3 + (Number(homePoints) || 0)
  const awayTotal = (Number(awayGoals) || 0) * 3 + (Number(awayPoints) || 0)

  context.fillStyle = '#ffffff'
  fitText(context, homeName, 430, 52)
  context.fillText(homeName, 285, 410)
  fitText(context, awayName, 430, 52)
  context.fillText(awayName, 795, 410)

  context.fillStyle = '#f4c430'
  context.font = '900 118px Arial, sans-serif'
  context.fillText(homeScore, 285, 575)
  context.fillText(awayScore, 795, 575)
  context.font = '900 34px Arial, sans-serif'
  context.fillText(`${homeTotal} PTS`, 285, 635)
  context.fillText(`${awayTotal} PTS`, 795, 635)

  context.fillStyle = '#ffffff'
  context.font = '900 54px Arial, sans-serif'
  context.fillText('V', 540, 530)

  if (countyFinalMode && sohWon) {
    context.fillStyle = '#f4c430'
    context.font = '900 72px Arial, sans-serif'
    context.fillText('🏆 COUNTY CHAMPIONS 🏆', 540, 800)
    context.fillStyle = '#ffffff'
    context.font = '900 48px Arial, sans-serif'
    context.fillText('BALLINAMORE SOH', 540, 870)
  } else {
    context.fillStyle = '#ffffff'
    context.font = '900 54px Arial, sans-serif'
    context.fillText('FULL-TIME', 540, 830)
  }

  context.fillStyle = '#b8c7be'
  context.font = '700 28px Arial, sans-serif'
  context.fillText('SOH MATCH CENTRE', 540, 988)

  const link = document.createElement('a')
  link.href = canvas.toDataURL('image/png')
  link.download = `soh-result-${new Date().toISOString().slice(0, 10)}.png`
  link.click()
}
