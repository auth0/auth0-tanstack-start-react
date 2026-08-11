import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from 'react'

/** Tiny class combiner (avoids pulling in clsx for an example). */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-indigo-600 text-white hover:bg-indigo-500 focus-visible:outline-indigo-600',
  secondary:
    'bg-white text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50',
  ghost: 'text-gray-700 hover:bg-gray-100',
  danger: 'bg-rose-600 text-white hover:bg-rose-500',
}

export function Button({
  variant = 'primary',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium',
        'transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function TextInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900',
        'placeholder:text-gray-400 focus-visible:outline focus-visible:outline-2',
        'focus-visible:outline-offset-2 focus-visible:outline-indigo-600',
        className,
      )}
      {...props}
    />
  )
}

export function Card({
  title,
  description,
  icon,
  children,
  className,
}: {
  title?: ReactNode
  description?: ReactNode
  icon?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <section
      className={cx(
        'rounded-2xl border border-gray-200 bg-white p-6 shadow-sm',
        className,
      )}
    >
      {(title || description) && (
        <header className="mb-4 flex items-start gap-3">
          {icon && (
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
              {icon}
            </span>
          )}
          <div>
            {title && (
              <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            )}
            {description && (
              <p className="mt-0.5 text-sm text-gray-500">{description}</p>
            )}
          </div>
        </header>
      )}
      {children}
    </section>
  )
}

export function Badge({
  children,
  tone = 'gray',
}: {
  children: ReactNode
  tone?: 'gray' | 'green' | 'amber' | 'indigo'
}) {
  const tones = {
    gray: 'bg-gray-100 text-gray-700',
    green: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    indigo: 'bg-indigo-100 text-indigo-700',
  }
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        tones[tone],
      )}
    >
      {children}
    </span>
  )
}

export function CodeBlock({ children }: { children: ReactNode }) {
  return (
    <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-gray-900 p-4 text-xs leading-relaxed text-gray-100">
      <code>{children}</code>
    </pre>
  )
}
