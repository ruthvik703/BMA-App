import React from 'react';
import { BeltRank } from '../types';

interface BeltPreviewProps {
  rank: BeltRank;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  stackedOnMobile?: boolean;
  key?: React.Key;
}

export function BeltPreview({ rank, size = 'md', showLabel = true, stackedOnMobile = false }: BeltPreviewProps) {
  const isGradient = rank.color.includes('linear-gradient');

  // Size configurations
  const heightClass = {
    sm: 'h-4 w-12 text-[10px]',
    md: 'h-6 w-20 text-xs',
    lg: 'h-8 w-28 text-sm',
  }[size];

  return (
    <div className={`flex ${stackedOnMobile ? 'flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2' : 'items-center gap-2'}`}>
      <div 
        className={`relative rounded border border-zinc-700 shadow-inner overflow-hidden flex items-center justify-center font-mono font-semibold select-none shrink-0 ${heightClass}`}
        style={{
          background: isGradient ? undefined : rank.color,
          backgroundImage: isGradient ? rank.color : undefined,
          color: rank.color === '#f4f4f5' ? '#18181b' : '#ffffff',
          textShadow: rank.color === '#f4f4f5' ? 'none' : '0 1px 2px rgba(0,0,0,0.6)',
        }}
        title={rank.name}
      >
        {/* Render horizontal stripe if configured (like 9th Kyu, 1st Kyu, int shodan) */}
        {rank.stripe && rank.stripe.style === 'horizontal' && (
          <div 
            className="absolute inset-x-0 h-1.5 border-y border-zinc-900"
            style={{ 
              backgroundColor: rank.stripe.color,
              top: 'calc(50% - 3px)'
            }} 
          />
        )}

        {/* Kyu text on belt for advanced ranks */}
        <span className="relative z-10 text-[9px] tracking-tighter opacity-85 uppercase">
          {rank.kyuText || ''}
        </span>
      </div>
      {showLabel && (
        <>
          <span className={`text-zinc-200 text-sm font-medium ${stackedOnMobile ? 'hidden sm:block' : ''}`}>
            {rank.name}
          </span>
          {stackedOnMobile ? (
            <span className="text-zinc-400 text-[10px] font-black uppercase sm:hidden leading-none text-center">
              {rank.kyuText || rank.name.split('-')[0].trim()}
            </span>
          ) : null}
        </>
      )}
    </div>
  );
}
