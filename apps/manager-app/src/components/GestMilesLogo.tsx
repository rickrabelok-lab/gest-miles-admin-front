type GestMilesLogoProps = {
  className?: string;
  size?: number;
  /** Use "light" on dark/purple backgrounds (e.g. gradient header) for better contrast */
  variant?: "default" | "light";
};

const GestMilesLogo = ({ className = "", size = 28, variant = "default" }: GestMilesLogoProps) => {
  const color = variant === "light" ? "#FFFFFF" : "#8A05BE";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {/* Iconic GM – single stroke, balanced, memorable */}
      <path
        d="M15 10a6 6 0 0 1 0 12v-6h-3M15 10v12l3-6 3 6V10"
        stroke={color}
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
};

export default GestMilesLogo;
