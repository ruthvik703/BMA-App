import React from 'react';

interface DojoLogoProps {
  className?: string;
  size?: number; // width/height in px
}

export function DojoLogo({ className = '', size = 80 }: DojoLogoProps) {
  return (
    <div 
      style={{ width: size, height: size }}
      className={`relative rounded-full overflow-hidden flex-none aspect-square shadow-md border border-zinc-800 bg-zinc-950 print:!border-none print:!bg-transparent print:!bg-none print:!shadow-none ${className}`}
    >
      <img 
        src="/logo.png" 
        alt="Buckner Martial Arts Logo" 
        className="absolute inset-0 w-full h-full object-cover rounded-full select-none brightness-105 transition duration-150 print:brightness-100"
      />
    </div>
  );
}
