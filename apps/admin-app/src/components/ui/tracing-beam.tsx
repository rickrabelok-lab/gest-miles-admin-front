import * as React from "react";
import { motion, useScroll, useSpring, useTransform } from "framer-motion";

import { cn } from "@/lib/utils";

const MotionLinearGradient = motion.create("linearGradient");

export type TracingBeamProps = {
  children: React.ReactNode;
  className?: string;
};

export const TracingBeam = ({ children, className }: TracingBeamProps) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  const contentRef = React.useRef<HTMLDivElement>(null);
  const [svgHeight, setSvgHeight] = React.useState(0);

  React.useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSvgHeight(el.offsetHeight);
    });
    ro.observe(el);
    setSvgHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  const y1 = useSpring(useTransform(scrollYProgress, [0, 0.8], [50, Math.max(svgHeight, 100)]), {
    stiffness: 500,
    damping: 90,
  });
  const y2 = useSpring(useTransform(scrollYProgress, [0, 1], [50, Math.max(svgHeight - 200, 50)]), {
    stiffness: 500,
    damping: 90,
  });

  const dotBg = useTransform(scrollYProgress, [0, 0.05], ["rgb(34 197 94)", "#ffffff"]);
  const dotBorder = useTransform(scrollYProgress, [0, 0.05], ["rgb(22 163 74)", "#d4d4d4"]);

  const gradId = React.useId().replace(/:/g, "");

  return (
    <motion.div ref={ref} className={cn("relative mx-auto h-full w-full max-w-4xl", className)}>
      <div className="absolute -left-4 top-3 md:-left-20">
        <div className="ml-[27px] flex h-4 w-4 items-center justify-center rounded-full border border-neutral-200 shadow-sm">
          <motion.div
            className="h-2 w-2 rounded-full border border-neutral-300"
            style={{ backgroundColor: dotBg, borderColor: dotBorder }}
          />
        </div>
        <svg
          viewBox={`0 0 20 ${Math.max(svgHeight, 1)}`}
          width="20"
          height={Math.max(svgHeight, 1)}
          className="ml-4 block"
          aria-hidden
        >
          <path
            d={`M 1 0V -36 l 18 24 V ${svgHeight * 0.8} l -18 24V ${svgHeight}`}
            fill="none"
            stroke="#9091A0"
            strokeOpacity={0.16}
          />
          <motion.path
            d={`M 1 0V -36 l 18 24 V ${svgHeight * 0.8} l -18 24V ${svgHeight}`}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={1.25}
            className="motion-reduce:hidden"
          />
          <defs>
            <MotionLinearGradient
              id={gradId}
              gradientUnits="userSpaceOnUse"
              x1="0"
              x2="0"
              y1={y1}
              y2={y2}
            >
              <stop stopColor="#18CCFC" stopOpacity={0} />
              <stop stopColor="#18CCFC" />
              <stop offset="0.325" stopColor="#6344F5" />
              <stop offset="1" stopColor="#AE48FF" stopOpacity={0} />
            </MotionLinearGradient>
          </defs>
        </svg>
      </div>
      <div ref={contentRef}>{children}</div>
    </motion.div>
  );
};
