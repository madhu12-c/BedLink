'use client';

import { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders a full-screen popup at the end of <body>. A `position: fixed` popup inside an
 * animated (transformed) card is trapped in that card's box and can end up under the map;
 * moving it to <body> keeps it covering the whole screen.
 */
export function ModalPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
