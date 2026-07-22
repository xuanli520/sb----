import { cn } from "./utils";

function Skeleton({ className, "aria-hidden": ariaHidden, ...props }: React.ComponentProps<"div">) {
  const isAnnounced = props.role !== undefined
    || props["aria-label"] !== undefined
    || props["aria-labelledby"] !== undefined;

  return (
    <div
      data-slot="skeleton"
      aria-hidden={ariaHidden ?? !isAnnounced}
      className={cn("bg-accent animate-pulse rounded-md motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

export { Skeleton };
