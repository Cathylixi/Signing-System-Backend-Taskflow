import { useId } from 'react'

const OPTIONS = [1, 2, 3, 5, 7]

export function ReminderSelect({ value, onChange }: { value: number; onChange: (days: number) => void }) {
  const id = useId()
  return (
    <div className="summary-block">
      <label className="summary-heading" htmlFor={id}>
        Reminders
      </label>
      <select
        id={id}
        className="input select"
        value={value}
        aria-describedby={`${id}-hint`}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {OPTIONS.map((d) => (
          <option key={d} value={d}>
            {d} {d === 1 ? 'day' : 'days'} before
          </option>
        ))}
      </select>
      <span className="hint" id={`${id}-hint`}>
        Sent before each due date.
      </span>
    </div>
  )
}
