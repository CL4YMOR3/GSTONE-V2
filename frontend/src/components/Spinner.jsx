import React from 'react';

export const Spinner = ({ size = 'md', className = '' }) => {
  const sizeClass = {
    sm: 'h-4 w-4 border-2',
    md: 'h-6 w-6 border-2',
    lg: 'h-10 w-10 border-[3px]',
    xl: 'h-12 w-12 border-[3px]',
  }[size] || 'h-6 w-6 border-2';

  return (
    <span
      aria-hidden="true"
      className={`inline-block rounded-full border-brand-emerald border-t-brand-emerald/20 animate-spin ${sizeClass} ${className}`}
    />
  );
};
