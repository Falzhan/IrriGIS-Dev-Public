// context/SheetContext.tsx
import React, { createContext, useContext, useState, ReactNode } from 'react';

interface SheetContextType {
  isSheetOpen: boolean;
  setSheetOpen: (open: boolean) => void;
  sheetIndex: number;
  setSheetIndex: (index: number) => void;
}

const SheetContext = createContext<SheetContextType>({
  isSheetOpen: false,
  setSheetOpen: () => {},
  sheetIndex: 0,
  setSheetIndex: () => {},
});

export function SheetProvider({ children }: { children: ReactNode }) {
  const [isSheetOpen, setSheetOpen] = useState(false);
  const [sheetIndex, setSheetIndex] = useState(0);

  return (
    <SheetContext.Provider value={{ isSheetOpen, setSheetOpen, sheetIndex, setSheetIndex }}>
      {children}
    </SheetContext.Provider>
  );
}

export function useSheet() {
  return useContext(SheetContext);
}
