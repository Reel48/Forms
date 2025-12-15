import './ProgressBar.css';

type ProgressBarProps = {
  value: number;
  label?: string;
  ariaLabel?: string;
};

export default function ProgressBar({ value, label, ariaLabel }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

  return (
    <div className="progressBarRoot">
      {label ? (
        <div className="progressBarLabelRow">
          <span className="progressBarLabel">{label}</span>
        </div>
      ) : null}

      <div
        className="progressBarTrack"
        role="progressbar"
        aria-label={ariaLabel || 'Progress'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
      >
        <div className="progressBarFill" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
