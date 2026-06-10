import React from 'react';
import { motion } from 'framer-motion';

const CoreSynchronization = () => {
  return (
    <div className="relative flex items-center justify-center p-8 w-full max-w-sm mx-auto group">
      {/* Outer rotating ring */}
      <div className="absolute inset-0 rounded-full border border-dashed border-[#6E5AFF]/30 animate-core-rotate opacity-60" />
      
      {/* Inner counter-rotating ring */}
      <div className="absolute inset-4 rounded-full border border-[#00B4E6]/20 animate-core-reverse opacity-80" style={{ borderStyle: 'dotted' }} />
      
      {/* Orbital particles */}
      <motion.div 
        animate={{ rotate: 360 }}
        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
        className="absolute inset-0 rounded-full"
      >
        <div className="absolute -top-1.5 left-1/2 w-3 h-3 bg-[#00C882] rounded-full shadow-[0_0_15px_#00C882]" />
      </motion.div>

      <motion.div 
        animate={{ rotate: -360 }}
        transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
        className="absolute inset-4 rounded-full"
      >
        <div className="absolute bottom-4 right-4 w-2 h-2 bg-[#F03C5F] rounded-full shadow-[0_0_10px_#F03C5F]" />
      </motion.div>

      {/* Center AI Core Orb */}
      <motion.div
        className="relative z-10 w-32 h-32 rounded-full overflow-hidden flex flex-col items-center justify-center border border-white cursor-pointer backdrop-blur-3xl shadow-[0_10px_30px_rgba(110,90,255,0.1)]"
        style={{
          background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.9) 0%, rgba(244,247,251,0.6) 100%)',
        }}
        whileHover={{ scale: 1.05, boxShadow: '0 15px 40px rgba(110,90,255,0.15), inset 0 0 20px rgba(0,180,230,0.1)' }}
        animate={{
          boxShadow: [
            '0 10px 30px rgba(110,90,255,0.1), inset 0 0 10px rgba(0,180,230,0.05)',
            '0 15px 40px rgba(110,90,255,0.15), inset 0 0 20px rgba(0,180,230,0.1)',
            '0 10px 30px rgba(110,90,255,0.1), inset 0 0 10px rgba(0,180,230,0.05)'
          ]
        }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="text-on-surface font-outfit font-black tracking-widest text-sm mb-1 uppercase drop-shadow-[0_0_5px_rgba(255,255,255,1)]">Core</div>
        <div className="text-[#00C882] text-[9px] font-bold uppercase tracking-[0.2em] animate-pulse">Synced</div>
      </motion.div>
    </div>
  );
};

export default CoreSynchronization;
