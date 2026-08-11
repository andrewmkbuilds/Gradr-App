import { getPaddleEnvironment } from "@/lib/paddle";

/** Renders nothing in the live environment. */
export function PaymentTestModeBanner() {
  if (getPaddleEnvironment() !== "sandbox") return null;

  return (
    <div className="w-full border-b border-primary/30 bg-primary/10 px-4 py-2 text-center text-xs text-foreground/80">
      All payments in the preview are in test mode.{" "}
      <a
        href="https://docs.lovable.dev/features/payments#test-and-live-environments"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary underline underline-offset-4"
      >
        Read more
      </a>
    </div>
  );
}

export default PaymentTestModeBanner;
