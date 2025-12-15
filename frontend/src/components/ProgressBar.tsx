import './ProgressBar.css';

type ProgressBarProps = {
  value: number;
  label?: string;
  ariaLabel?: string;
};

export default function ProgressBar({ value, label, ariaLabel }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

  return (
    <div
      className="progressBarRoot"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      {label ? (
        <div className="progressBarLabelRow" style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <span className="progressBarLabel" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>
            {label}
          </span>
        </div>
      ) : null}

      <div
        className="progressBarTrack"
        role="progressbar"
        aria-label={ariaLabel || 'Progress'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        style={{
          height: '8px',
          width: '100%',
          background: '#e5e7eb',
          borderRadius: '999px',
          overflow: 'hidden',
        }}
      >
        <div
          className="progressBarFill"
          style={{
            width: `${clamped}%`,
            height: '100%',
            background: '#16a34a',
            borderRadius: '999px',
            transition: 'width 280ms ease-out',
          }}
        />
      </div>
    </div>
  );
}
