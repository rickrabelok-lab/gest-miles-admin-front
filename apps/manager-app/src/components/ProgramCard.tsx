import { ArrowUp, ArrowDown, AlertCircle, ImagePlus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useRef } from "react";

interface ProgramCardProps {
  programId?: string;
  name: string;
  logo: string;
  logoColor: string;
  balance: string;
  valueInBRL: string;
  lastUpdate: string;
  variation: "up" | "down" | "none";
  error?: string;
  expiring?: boolean;
  expiringTag?: "-90d" | "-60d" | "-30d";
  managerClientId?: string | null;
  managerClientName?: string | null;
  logoImageUrl?: string;
  onLogoImageChange?: (imageDataUrl: string) => void;
}

const ProgramCard = (props: ProgramCardProps) => {
  const {
    programId,
    name,
    logo,
    logoColor,
    balance,
    valueInBRL,
    lastUpdate,
    variation,
    error,
    expiring,
    expiringTag,
    managerClientId,
    managerClientName,
    logoImageUrl,
    onLogoImageChange,
  } =
    props;
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleOpenDetails = () => {
    const slug = programId ?? name.toLowerCase().replace(/\s+/g, "-");
    navigate(`/program/${encodeURIComponent(slug)}`, {
      state: {
        program: {
          programId,
          name,
          logo,
          logoColor,
          logoImageUrl,
          balance,
          valueInBRL,
          lastUpdate,
          variation,
          error,
          expiring,
          expiringTag,
          managerClientId,
          managerClientName,
        },
      },
    });
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleOpenDetails();
    }
  };

  const handleOpenLogoPicker: React.MouseEventHandler<HTMLButtonElement> = (
    event,
  ) => {
    event.stopPropagation();
    fileInputRef.current?.click();
  };

  const handleLogoFileChange: React.ChangeEventHandler<HTMLInputElement> = (
    event,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        onLogoImageChange?.(result);
      }
    };
    reader.readAsDataURL(file);
    event.currentTarget.value = "";
  };

  return (
    <div
      className="relative cursor-pointer rounded-[14px] gradient-card-subtle p-2 text-nubank-text shadow-nubank outline-none transition-all duration-300 ease-out hover:shadow-nubank-hover hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-primary/20 active:scale-[0.99]"
      role="button"
      tabIndex={0}
      onClick={handleOpenDetails}
      onKeyDown={handleKeyDown}
    >
      {/* Expiring badge */}
      {expiring && (
        <div className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-white shadow-sm" />
      )}

      <div className="flex items-start justify-between gap-1">
        {/* Logo */}
        <button
          type="button"
          onClick={handleOpenLogoPicker}
          className="group relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-[8px] font-bold transition-all duration-300 ease-out hover:brightness-95"
          style={{ backgroundColor: logoColor + "20", color: logoColor }}
          title="Alterar imagem do programa"
          aria-label={`Alterar imagem do programa ${name}`}
        >
          {logoImageUrl ? (
            <img
              src={logoImageUrl}
              alt={`Logo ${name}`}
              className="h-full w-full object-cover"
            />
          ) : (
            logo
          )}
          <span className="absolute inset-0 hidden items-center justify-center bg-black/35 text-white group-hover:flex">
            <ImagePlus size={10} />
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleLogoFileChange}
            onClick={(event) => event.stopPropagation()}
          />
        </button>

        {/* Variation arrow + balance */}
        <div className="flex min-w-0 flex-1 items-center justify-end gap-0.5">
          {variation === "up" && <ArrowUp size={11} className="shrink-0 text-success" strokeWidth={2.5} />}
          {variation === "down" && <ArrowDown size={11} className="shrink-0 text-destructive" strokeWidth={2.5} />}
          <span
            className={`truncate font-display text-sm font-bold tabular-nums ${
              variation === "up"
                ? "text-success"
                : variation === "down"
                ? "text-destructive"
                : "text-foreground"
            }`}
          >
            {balance}
          </span>
        </div>
      </div>

      <div className="mt-1 flex items-baseline justify-between gap-1">
        <p className="text-[10px] font-medium text-nubank-text-secondary leading-tight">{lastUpdate}</p>
        <p className="text-xs font-semibold tabular-nums text-nubank-text leading-tight">R$ {valueInBRL}</p>
      </div>

      {error && (
        <div className="mt-1 flex items-center justify-between gap-1 rounded-lg bg-black/[0.03] px-1.5 py-1 text-[10px] text-nubank-text-secondary">
          <div className="flex items-center gap-0.5">
            <AlertCircle size={10} />
            <span className="truncate">{error}</span>
          </div>
          {expiringTag && (
            <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[9px] font-semibold text-destructive">
              {expiringTag}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default ProgramCard;
