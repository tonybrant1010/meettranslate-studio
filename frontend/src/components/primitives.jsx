import React from "react";

export function IconButton({ label, onClick, children, active = false, className = "", ...rest }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
        active ? "bg-raised text-ink" : "text-muted hover:bg-raised hover:text-ink"
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Toggle({ checked, onChange, disabled, label, hint, testId }) {
  return (
    <label
      className={`flex items-start justify-between gap-4 py-2 ${
        disabled ? "opacity-50" : "cursor-pointer"
      }`}
    >
      <span className="min-w-0">
        <span className="block text-sm text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-xs leading-relaxed text-muted">{hint}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          data-testid={testId}
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="h-5 w-9 rounded-full bg-line transition-colors peer-checked:bg-partner" />
        <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

export function Slider({ label, value, onChange, accent = "#60A5FA", testId }) {
  return (
    <div className="py-2">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-ink">{label}</span>
        <span className="tabular text-xs text-muted">{Math.round(value * 100)}%</span>
      </div>
      <input
        data-testid={testId}
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="range w-full"
        style={{ "--accent": accent }}
      />
    </div>
  );
}

export function Select({ label, value, onChange, disabled, children, testId, hint }) {
  return (
    <label className="block py-2">
      <span className="mb-1.5 block text-sm text-ink">{label}</span>
      <select
        data-testid={testId}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="select w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm text-ink transition-colors hover:border-faint focus:border-partner focus:outline-none disabled:opacity-50"
      >
        {children}
      </select>
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Section({ title, children }) {
  return (
    <section className="border-b border-line px-6 py-5 last:border-b-0">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">{title}</h3>
      {children}
    </section>
  );
}

export function Button({ children, onClick, variant = "secondary", disabled, className = "", testId, ...rest }) {
  const styles = {
    primary: "bg-ink text-bg hover:bg-white",
    secondary: "border border-line bg-raised text-ink hover:border-faint",
    ghost: "text-muted hover:bg-raised hover:text-ink",
    danger: "bg-danger/90 text-white hover:bg-danger",
  };
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
