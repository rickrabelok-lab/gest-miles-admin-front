import { useEffect, useState } from "react";
import azulLogo from "@/assets/airline-azul.png";
import golLogo from "@/assets/airline-gol.png";
import latamLogo from "@/assets/airline-latam.png";
import tapLogo from "@/assets/airline-tap.png";
import americanAirlinesLogo from "@/assets/airline-american-airlines.png";

const AIRLINE_LOGO_BY_CODE: Record<string, { src: string; removeDarkBg?: boolean }> = {
  AZUL: { src: azulLogo, removeDarkBg: true },
  AD: { src: azulLogo, removeDarkBg: true },
  GOL: { src: golLogo, removeDarkBg: true },
  G3: { src: golLogo, removeDarkBg: true },
  LATAM: { src: latamLogo, removeDarkBg: true },
  LA: { src: latamLogo, removeDarkBg: true },
  LTM: { src: latamLogo, removeDarkBg: true },
  TAP: { src: tapLogo },
  TP: { src: tapLogo },
  AA: { src: americanAirlinesLogo, removeDarkBg: true },
  "AMERICAN AIRLINES": { src: americanAirlinesLogo, removeDarkBg: true },
};

const normalizeAirline = (airline: string) => airline.trim().toUpperCase();

type AirlineLogoProps = {
  airline: string | null | undefined;
  size?: number;
};

const AirlineLogo = ({ airline, size = 16 }: AirlineLogoProps) => {
  const normalized = airline ? normalizeAirline(airline) : "";
  const logoMeta = normalized ? AIRLINE_LOGO_BY_CODE[normalized] : undefined;
  const logoSrc = logoMeta?.src;
  const [processedSrc, setProcessedSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!logoMeta?.removeDarkBg || !logoSrc) {
      setProcessedSrc(null);
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.decoding = "async";

    image.onload = () => {
      if (cancelled) return;

      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      if (!context) {
        setProcessedSrc(null);
        return;
      }

      context.drawImage(image, 0, 0);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        if (a > 0 && r < 24 && g < 24 && b < 24) {
          data[i + 3] = 0;
        }
      }

      context.putImageData(imageData, 0, 0);
      setProcessedSrc(canvas.toDataURL("image/png"));
    };

    image.onerror = () => {
      if (!cancelled) setProcessedSrc(null);
    };

    image.src = logoSrc;

    return () => {
      cancelled = true;
    };
  }, [logoMeta?.removeDarkBg, logoSrc]);

  if (logoSrc) {
    return (
      <img
        src={processedSrc ?? logoSrc}
        alt={`Logo ${airline}`}
        className="rounded-sm object-contain"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className="inline-flex items-center justify-center rounded-sm bg-slate-200 text-[9px] font-bold text-slate-700"
      style={{ width: size, height: size }}
    >
      {normalized.slice(0, 2) || "--"}
    </span>
  );
};

export default AirlineLogo;
