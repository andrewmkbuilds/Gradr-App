import { Zap } from "lucide-react";
import { motion } from "framer-motion";
import { type ReactNode } from "react";

interface AuthLayoutProps {
  children: ReactNode;
}

const features = [
  "AI resume scoring and optimization",
  "Smart job matching with strategy insights",
  "One-click cover letters and outreach",
  "Mock interviews with real-time feedback",
];

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/5" />
        <div className="absolute top-1/4 left-1/3 h-64 w-64 rounded-full bg-primary/8 blur-[120px]" />
        <div className="absolute bottom-1/3 right-1/4 h-48 w-48 rounded-full bg-accent/10 blur-[100px]" />

        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="relative z-10 max-w-md px-12 space-y-8"
        >
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-primary/20 glow-border flex items-center justify-center">
              <Zap className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-3xl font-bold gradient-text tracking-tight">HireOS</h1>
          </div>

          <p className="text-2xl font-semibold text-foreground leading-snug">
            Your AI career command center.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Resume analysis. Job matching. Application generation. Interview coaching. One platform, zero guesswork.
          </p>

          <div className="space-y-4 pt-4">
            {features.map((feature, i) => (
              <motion.div
                key={feature}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.4 + i * 0.1 }}
                className="flex items-center gap-3"
              >
                <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                <span className="text-sm text-muted-foreground">{feature}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Right panel — form content */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-sm space-y-8"
        >
          {/* Mobile-only logo */}
          <div className="lg:hidden text-center space-y-3">
            <div className="h-12 w-12 rounded-2xl bg-primary/20 glow-border flex items-center justify-center mx-auto">
              <Zap className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-2xl font-bold gradient-text">HireOS</h1>
          </div>

          {children}
        </motion.div>
      </div>
    </div>
  );
}
