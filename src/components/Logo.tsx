/**
 * Partha's mark: a drawn bow with the arrow loosed toward the target.
 * Partha — the archer whose eye stayed on the bird's eye — is the namesake
 * of this job hunt: many boards, one true aim.
 */
export default function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg
      className="logo-mark"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* bow limb */}
      <path
        d="M10 4.5 C 18.5 8.5, 18.5 23.5, 10 27.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* bowstring, drawn back */}
      <path
        d="M10 4.5 L6.5 16 L10 27.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.5"
      />
      {/* arrow, loosed */}
      <path d="M6.5 16 H25.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path
        d="M25.5 16 L20.6 13.1 M25.5 16 L20.6 18.9"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* the target, small and certain */}
      <circle cx="29" cy="16" r="1.6" fill="currentColor" />
    </svg>
  );
}
