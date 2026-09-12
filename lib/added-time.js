const periods = {
  'FIRST HALF': 'first_half',
  'SECOND HALF': 'second_half',
  'EXTRA TIME': 'extra_time',
  'EXTRA TIME 2ND HALF': 'extra_time_second_half'
}

export function addedTimePeriod(period) {
  const phase = periods[period] || period
  return { first_half: 'first half', second_half: 'second half', extra_time: 'extra time first half', extra_time_second_half: 'extra time second half' }[phase] || phase
}

export function getAddedTime(events, period) {
  const phase = addedTimePeriod(period)
  const matching = events.filter(event =>
    event.event_type === 'manual_update' &&
    event.notes?.startsWith(`Added time (${phase}): `)
  ).sort((a, b) => Number(b.id) - Number(a.id))
  const value = matching[0]?.notes?.match(/: (\d+) minutes?$/)?.[1]
  return value ? Number(value) : 0
}
