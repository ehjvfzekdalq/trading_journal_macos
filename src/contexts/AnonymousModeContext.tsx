import React, { createContext, useContext, useState, useEffect } from 'react';

interface AnonymousModeContextType {
  isAnonymous: boolean;
  toggleAnonymous: () => void;
}

const AnonymousModeContext = createContext<AnonymousModeContextType | undefined>(undefined);

export function AnonymousModeProvider({ children }: { children: React.ReactNode }) {
  const [isAnonymous, setIsAnonymous] = useState(() => {
    const stored = localStorage.getItem('anonymous-mode');
    return stored === 'true';
  });

  useEffect(() => {
    localStorage.setItem('anonymous-mode', String(isAnonymous));
  }, [isAnonymous]);

  const toggleAnonymous = () => {
    setIsAnonymous(prev => !prev);
  };

  return (
    <AnonymousModeContext.Provider value={{ isAnonymous, toggleAnonymous }}>
      {children}
    </AnonymousModeContext.Provider>
  );
}

export function useAnonymousMode() {
  const context = useContext(AnonymousModeContext);
  if (context === undefined) {
    throw new Error('useAnonymousMode must be used within AnonymousModeProvider');
  }
  return context;
}
