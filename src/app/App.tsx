import React, { useEffect, useState } from 'react';
import { ConsolePage } from './routes/ConsolePage.js';
import { SystemCheckPage } from './routes/SystemCheckPage.js';

export function App(): React.JSX.Element {
  const [currentHash, setCurrentHash] = useState<string>(
    () => window.location.hash || '#/'
  );

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentHash(window.location.hash || '#/');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  if (currentHash.startsWith('#/check')) {
    return <SystemCheckPage />;
  }

  return <ConsolePage />;
}
