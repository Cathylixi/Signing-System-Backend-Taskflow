import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import { isEmail, searchDirectory, type DirectoryMatch } from '../lib/people'

interface PeopleSearchProps {
  label: string
  placeholder?: string
  /** Lower-cased emails already added; hidden from person suggestions. */
  exclude: Set<string>
  onAdd: (emails: string[]) => void
}

export default function PeopleSearch({
  label,
  placeholder = 'Search by name, email or group',
  exclude,
  onAdd,
}: PeopleSearchProps) {
  const id = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const matches = useMemo(() => {
    const found = searchDirectory(query, exclude)
    const typed = query.trim()
    // Allow adding any valid address that isn't in the directory.
    if (isEmail(typed) && !found.some((m) => m.emails.length === 1 && m.emails[0] === typed)) {
      found.push({ kind: 'person', label: typed, detail: 'Add this email address', emails: [typed] })
    }
    return found
  }, [query, exclude])

  function choose(match: DirectoryMatch) {
    onAdd(match.emails)
    setQuery('')
    setOpen(false)
    setActive(0)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((a) => Math.min(a + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' && matches[active]) {
      e.preventDefault()
      choose(matches[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const showList = open && matches.length > 0

  return (
    <div className="people-search">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input"
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        autoComplete="off"
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul className="suggestions" id={`${id}-list`} role="listbox">
          {matches.map((m, i) => (
            <li
              key={`${m.kind}-${m.label}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : undefined}
              // mousedown (not click) so it fires before the input's blur closes the list
              onMouseDown={(e) => {
                e.preventDefault()
                choose(m)
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className={`suggestion-badge ${m.kind}`}>{m.kind === 'group' ? 'Group' : 'Person'}</span>
              <span className="suggestion-text">
                <strong>{m.label}</strong>
                <span>{m.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
