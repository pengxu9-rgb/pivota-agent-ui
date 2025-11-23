import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {}

export const GlassCard = ({ className, children, ...props }: GlassCardProps) => {
  return (
    <div
      className={cn(
        "bg-white/5 border border-white/10 backdrop-blur-xl rounded-3xl shadow-glass",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

