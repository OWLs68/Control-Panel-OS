/**
 * Inline stroke icons. Kept in-repo rather than pulling an icon package: the
 * panel needs eight glyphs, and a dependency for that is not worth the weight.
 */
type IconProps = { className?: string; style?: React.CSSProperties }

function Svg({ children, className, style }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={style}
    >
      {children}
    </svg>
  )
}

export const IconDashboard = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7.5" height="9" rx="1.5" />
    <rect x="13.5" y="3" width="7.5" height="5.5" rx="1.5" />
    <rect x="3" y="15" width="7.5" height="6" rx="1.5" />
    <rect x="13.5" y="11.5" width="7.5" height="9.5" rx="1.5" />
  </Svg>
)

export const IconProjects = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17.5Z" />
  </Svg>
)

export const IconMemory = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4.5a3.5 3.5 0 0 0-3.5 3.5 3 3 0 0 0-1 5.8A3.2 3.2 0 0 0 10.7 20 3.3 3.3 0 0 0 12 19.7Z" />
    <path d="M12 4.5A3.5 3.5 0 0 1 15.5 8a3 3 0 0 1 1 5.8A3.2 3.2 0 0 1 13.3 20a3.3 3.3 0 0 1-1.3-.3Z" />
    <path d="M12 4.5v15" />
  </Svg>
)

export const IconAgents = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="8" width="16" height="11" rx="2.5" />
    <path d="M12 8V4.5M9 13h.01M15 13h.01M9.5 16.2h5" />
  </Svg>
)

export const IconActivity = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12.5h4l2.5-6.5 4 13 2.5-6.5h5" />
  </Svg>
)

export const IconSettings = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v2.2M12 19.3v2.2M4.2 7.3l1.9 1.1M17.9 15.6l1.9 1.1M4.2 16.7l1.9-1.1M17.9 8.4l1.9-1.1" />
  </Svg>
)

export const IconChevron = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 5.5 15.5 12 9 18.5" />
  </Svg>
)

export const IconExternal = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4.5h5.5V10M19 5 11 13" />
    <path d="M18 14.5v4a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6h4" />
  </Svg>
)

export const IconAlert = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4.5 21 19.5H3Z" />
    <path d="M12 10v4M12 16.8h.01" />
  </Svg>
)
