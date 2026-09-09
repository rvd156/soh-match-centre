function Jersey({ number }) {
  return (
    <svg viewBox="0 0 64 58" width="46" height="42" aria-hidden="true" style={{ display: 'block', margin: '0 auto' }}>
      <path d="M19 5 7 10 1 25l10 5 6-10v33h30V20l6 10 10-5-6-15L45 5l-7 5H26Z" fill="#f4c430" stroke="#063c25" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="m19 5 7 5h12l7-5-4 12H23Z" fill="#0b5b37" />
      <path d="M2 24.5 12 29l3-6-10-5Z" fill="#0b5b37" />
      <path d="m62 24.5-10 4.5-3-6 10-5Z" fill="#0b5b37" />
      <text x="32" y="38" textAnchor="middle" fill="#071a12" fontFamily="Arial, sans-serif" fontSize="17" fontWeight="900">
        {number || '–'}
      </text>
    </svg>
  )
}

function FormationPlayer({ player, fallbackNumber }) {
  if (!player) return <div />

  return (
    <div style={{ minWidth: 0, textAlign: 'center', position: 'relative', zIndex: 2 }}>
      <Jersey number={player.number || fallbackNumber} />
      <div
        style={{
          margin: '2px auto 0',
          maxWidth: '120px',
          color: '#fff',
          fontSize: 'clamp(10px, 2.8vw, 13px)',
          fontWeight: '900',
          lineHeight: 1.15,
          textShadow: '0 1px 3px rgba(0,0,0,0.95)',
          overflowWrap: 'anywhere'
        }}
      >
        {player.name}
      </div>
    </div>
  )
}

function FormationRow({ players, startNumber }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${players.length}, minmax(0, 1fr))`, alignItems: 'center', gap: '4px' }}>
      {players.map((player, index) => (
        <FormationPlayer
          key={`${startNumber + index}-${player?.name || 'empty'}`}
          player={player}
          fallbackNumber={startNumber + index}
        />
      ))}
    </div>
  )
}

function Pitch({ players }) {
  const padded = Array.from({ length: 15 }, (_, index) => players[index] || null)

  return (
    <div
      aria-label="Ballinamore SOH starting formation"
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateRows: 'repeat(6, 1fr)',
        gap: '8px',
        minHeight: '650px',
        padding: '26px 8px',
        border: '3px solid rgba(255,255,255,0.78)',
        borderRadius: '8px',
        background: 'linear-gradient(90deg, #126b35 0%, #178040 50%, #126b35 100%)',
        overflow: 'hidden',
        boxShadow: 'inset 0 0 28px rgba(0,0,0,0.2)'
      }}
    >
      {[20, 39, 50, 66, 80].map(position => (
        <div
          key={position}
          aria-hidden="true"
          style={{ position: 'absolute', top: `${position}%`, left: 0, right: 0, borderTop: '2px solid rgba(255,255,255,0.62)' }}
        />
      ))}
      <div
        aria-hidden="true"
        style={{ position: 'absolute', top: 0, left: '38%', width: '24%', height: '18px', border: '2px solid rgba(255,255,255,0.75)', borderTop: 0 }}
      />

      <FormationRow players={padded.slice(0, 1)} startNumber={1} />
      <FormationRow players={padded.slice(1, 4)} startNumber={2} />
      <FormationRow players={padded.slice(4, 7)} startNumber={5} />
      <FormationRow players={padded.slice(7, 9)} startNumber={8} />
      <FormationRow players={padded.slice(9, 12)} startNumber={10} />
      <FormationRow players={padded.slice(12, 15)} startNumber={13} />
    </div>
  )
}

function SubstituteList({ players }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '8px 18px' }}>
      {players.map((player, index) => (
        <div
          key={`${player.number || 'sub'}-${player.name}-${index}`}
          style={{ display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr)', gap: '9px', padding: '8px 2px', borderBottom: '1px solid #1c4932' }}
        >
          <strong style={{ color: '#f4c430', textAlign: 'right' }}>{player.number || '–'}</strong>
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
    <details style={{ marginTop: '24px', border: '1px solid #1c4932', borderRadius: '18px', background: '#0b281c', overflow: 'hidden' }}>
      <summary
        style={{ cursor: 'pointer', padding: '16px', color: '#f4c430', fontSize: '16px', fontWeight: '900', textAlign: 'center', listStylePosition: 'inside' }}
      >
        VIEW {teamName.toUpperCase()} LINEUP
      </summary>

      <div style={{ padding: '4px 14px 22px' }}>
        {starters.length > 0 && (
          <section>
            <h3 style={{ color: '#f4c430', fontSize: '14px', letterSpacing: '1px', textAlign: 'center' }}>STARTING 15</h3>
            <Pitch players={starters} />
          </section>
        )}

        {substitutes.length > 0 && (
          <section style={{ marginTop: '24px' }}>
            <h3 style={{ color: '#f4c430', fontSize: '14px', letterSpacing: '1px', textAlign: 'center' }}>SUBSTITUTES</h3>
            <SubstituteList players={substitutes} />
          </section>
        )}
      </div>
    </details>
  )
}
