"use client";

import { ReactNode } from "react";
import { motion } from "framer-motion";
import logoImage from "@/assets/logo.png";

type AuthShellProps = {
  children: ReactNode;
  brandSlot?: ReactNode;
};

const PARTICLES = Array.from({ length: 15 }, (_, i) => ({
  id: i,
  width: (i % 3) + 1,
  height: (i % 3) + 1,
  left: (i * 13) % 100,
  top: (i * 17) % 100,
  duration: 12 + (i % 5),
  delay: (i % 4) * 0.8,
}));

function DefaultBrand() {
  return (
    <div className="relative group perspective-1000">
      <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/20 to-purple-500/20 rounded-full blur-[60px] opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />

      <motion.img
        src={logoImage.src}
        alt="智服云声数据"
        className="relative z-10 w-[360px] object-contain drop-shadow-2xl"
        animate={{
          y: [0, -15, 0],
          rotateZ: [0, 1, 0, -1, 0],
        }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        style={{
          filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.5))",
        }}
      />

      <div className="mt-12 text-center space-y-2">
        <h2 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-100 to-white tracking-tight">
          智服云声数据
        </h2>
        <p className="text-cyan-200/40 text-sm font-mono tracking-[0.3em] uppercase">
          Enterprise Neural Network v2.0
        </p>
      </div>
    </div>
  );
}

export default function AuthShell({ children, brandSlot }: AuthShellProps) {
  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#0a1628]">
      {/* 背景层：渐变与粒子 */}
      <div className="absolute inset-0 z-0">
        <motion.div
          className="absolute -top-[20%] -left-[10%] w-[60vw] h-[60vw] bg-cyan-500/10 rounded-full blur-[120px]"
          animate={{ scale: [1, 1.05, 1], rotate: [0, 2, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute top-[40%] -right-[10%] w-[50vw] h-[50vw] bg-indigo-600/10 rounded-full blur-[100px]"
          animate={{ scale: [1, 0.98, 1], rotate: [0, -1, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        />

        {PARTICLES.map((particle) => (
          <motion.div
            key={particle.id}
            suppressHydrationWarning
            className="absolute bg-white/15 rounded-full blur-[1px]"
            style={{
              width: `${particle.width}px`,
              height: `${particle.height}px`,
              left: `${particle.left}%`,
              top: `${particle.top}%`,
            }}
            animate={{
              y: [0, -120],
              opacity: [0, 0.5, 0],
            }}
            transition={{
              duration: particle.duration,
              repeat: Infinity,
              ease: "linear",
              delay: particle.delay,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 flex flex-col lg:flex-row items-center justify-between gap-12">
        <div className="hidden lg:flex flex-col items-center justify-center w-1/2 relative">
          {brandSlot ?? <DefaultBrand />}
        </div>
        <div className="w-full lg:w-1/2 flex justify-center">{children}</div>
      </div>
    </div>
  );
}
