import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function IconButton({
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(
        "grid size-[34px] shrink-0 place-items-center rounded-[7px] text-muted transition-colors hover:bg-[#f2f2ee] hover:text-ink disabled:hover:bg-transparent disabled:hover:text-muted",
        className,
      )}
      {...props}
    />
  );
}
