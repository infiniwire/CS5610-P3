import { useEffect, useId, useRef, useState } from "react";
import "./UniversityFilter.css";

const fold = (text) =>
  text
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
const label = (university) =>
  `${university.name}${university.country ? ` (${university.country})` : ""}`;
const limit = 30;

export default function UniversityFilter({ universities, value, onChange, failed }) {
  const id = useId();
  const input = useRef(null);
  const optionRefs = useRef([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [active, setActive] = useState(0);
  const selected = universities.find((university) => university.id === value);
  const selectedLabel = selected
    ? label(selected)
    : value
      ? `University ${value.split("/").at(-1)}`
      : "";
  const words = fold(draft ?? selectedLabel)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const matches = universities.filter((university) =>
    words.every((word) => fold(label(university)).includes(word)),
  );
  const options = [
    ...(!words.length ? [{ id: "", name: "All universities" }] : []),
    ...matches.slice(0, limit),
  ];
  const activeIndex = Math.min(active, options.length - 1);
  const expanded = open && universities.length > 0;

  useEffect(() => {
    if (expanded) optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, expanded, draft]);

  function dismiss() {
    setOpen(false);
    setDraft(null);
    setActive(0);
  }

  function choose(universityId) {
    onChange(universityId);
    dismiss();
  }

  function handleKey(event) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((previous) =>
        !expanded
          ? 0
          : Math.max(
              0,
              Math.min(options.length - 1, previous + (event.key === "ArrowDown" ? 1 : -1)),
            ),
      );
    } else if (event.key === "Enter" && expanded) {
      event.preventDefault();
      if (options[activeIndex]) choose(options[activeIndex].id);
    } else if (event.key === "Escape") {
      event.preventDefault();
      dismiss();
    }
  }

  return (
    <div className="university-filter">
      <label htmlFor={id}>University</label>
      <div className="university-input-wrap">
        <input
          ref={input}
          id={id}
          name="institution"
          type="text"
          role="combobox"
          value={draft ?? selectedLabel}
          placeholder={
            failed
              ? "Universities unavailable"
              : universities.length
                ? "Search universities…"
                : "Loading universities…"
          }
          autoComplete="off"
          spellCheck={false}
          disabled={!universities.length}
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={`${id}-options`}
          aria-activedescendant={
            expanded && options[activeIndex] ? `${id}-option-${activeIndex}` : undefined
          }
          aria-describedby={expanded ? `${id}-status` : undefined}
          onFocus={(event) => {
            setOpen(true);
            if (draft === null) event.currentTarget.select();
          }}
          onChange={(event) => {
            setDraft(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onBlur={dismiss}
          onKeyDown={handleKey}
        />
        {value && (
          <button
            type="button"
            className="university-clear"
            aria-label="Clear university filter"
            onClick={() => choose("")}
          >
            ×
          </button>
        )}
      </div>
      {expanded && (
        <div className="university-popup">
          <ul id={`${id}-options`} role="listbox" aria-label="Universities">
            {options.map((university, index) => (
              <li
                key={university.id}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={value === university.id}
                className={activeIndex === index ? "university-option-active" : undefined}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActive(index)}
                onClick={() => choose(university.id)}
              >
                {label(university)}
              </li>
            ))}
          </ul>
          <p id={`${id}-status`} role="status">
            {matches.length === 0
              ? "No universities match your search."
              : matches.length > limit
                ? `Showing the first ${limit} of ${matches.length} universities. Keep typing to narrow the list.`
                : `${matches.length} ${matches.length === 1 ? "university" : "universities"} found.`}
          </p>
        </div>
      )}
    </div>
  );
}
