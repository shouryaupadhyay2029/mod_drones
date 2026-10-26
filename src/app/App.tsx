import React, { useEffect, useState } from 'react';
import { ConsolePage } from './routes/ConsolePage.js';
import { SystemCheckPage } from './routes/SystemCheckPage.js';
import { CONTACT_REFERENCES, ContactReferencePage } from './console/ContactLibrary.js';
import { AarPage } from './aar/AarPage.js';
import { CommanderPage } from './commander/CommanderPage.js';

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

  if (currentHash.startsWith('#/aar')) {
    return <AarPage />;
  }

  if (currentHash.startsWith('#/commander')) {
    return <CommanderPage />;
  }

  const contactId = currentHash.match(/^#\/contacts\/([^/?#]+)/)?.[1];
  if (contactId) {
    const contact = CONTACT_REFERENCES.find((entry) => entry.id === decodeURIComponent(contactId));
    if (contact) {
      return <ContactReferencePage key="contact-reference" contact={contact} onBack={() => { window.location.hash = '#/'; }} />;
    }
  }

  return <ConsolePage />;
}
