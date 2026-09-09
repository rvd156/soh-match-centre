function PlayerList({ players }) {
  return (
    <div style={{ display: 'grid', gap: '7px' }}>
      {players.map((player, index) => (
        <div
          key={`${player.number || 'player'}-${player.name}-${index}`}
          style={{
            display: 'grid',
            gridTemplateColumns: '32px minmax(0, 1fr)',
            gap: '9px',
            alignItems: 'baseline',
            paddingBottom: '7px',
            borderBottom: '1px solid #1c4932'
          }}
        >
          <strong style={{ color: '#f4c430', textAlign: 'right' }}>
            {player.number || '–'}
          </strong>
          <span style={{ color: '#fff', fontWeight: '750' }}>{player.name}</span>
        </div>
      ))}
    </div>
  )
}

export default function TeamLineup({ lineup, teamName = 'Ballinamore SOH' }) {
  const starters = Array.isArray(lineup?.starters) ? lineup.starters : []
  const substitutes = Array.isArray(lineup?.substitutes) ? lineup.substitutes : []

  if (starters.length === 0 && substitutes.length === 0) return null

  return (
    <details
      style={{
        marginTop: '24px',
        border: '1px solid #1c4932',
        borderRadius: '18px',
        background: '#0b281c',
        overflow: 'hidden'
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          padding: '16px',
          color: '#f4c430',
          fontSize: '16px',
          fontWeight: '900',
          textAlign: 'center',
          listStylePosition: 'inside'
        }}
      >
        VIEW {teamName.toUpperCase()} LINEUP
      </summary>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '24px',
          padding: '4px 18px 20px'
        }}
      >
        {starters.length > 0 && (
          <section>
            <h3 style={{ color: '#f4c430', fontSize: '14px', letterSpacing: '1px' }}>
              STARTING 15
            </h3>
            <PlayerList players={starters} />
          </section>
        )}

        {substitutes.length > 0 && (
          <section>
            <h3 style={{ color: '#f4c430', fontSize: '14px', letterSpacing: '1px' }}>
              SUBSTITUTES
            </h3>
            <PlayerList players={substitutes} />
          </section>
        )}
      </div>
    </details>
  )
}
