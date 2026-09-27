import React from 'react';

/** Original Sampark NE mark: a road winding through hills to a destination. Deliberately
 *  not the State Emblem of India, whose use is restricted by law to
 *  actual government bodies. */
export const BrandMark: React.FC<{ size?: number }> = ({ size = 52 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Sampark NE logo">
    <path d="M32 3 L57 12 V31 C57 46 46 56 32 61 C18 56 7 46 7 31 V12 Z" fill="#0b3068" />
    <path d="M32 7 L53 14.5 V31 C53 43.5 44 52 32 56.5 C20 52 11 43.5 11 31 V14.5 Z" fill="none" stroke="#ff9933" strokeWidth="2" />
    <path d="M11 40 L22 26 L30 34 L40 22 L53 40 Z" fill="#138808" opacity="0.9" />
    <path d="M20 52 C26 46, 38 47, 34 40 S26 32, 36 27" fill="none" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" />
    <path d="M36 14 C32 14 30 17 30 19.5 C30 23 36 28 36 28 C36 28 42 23 42 19.5 C42 17 40 14 36 14 Z" fill="#ff9933" />
    <circle cx="36" cy="19.5" r="2" fill="#0b3068" />
  </svg>
);
