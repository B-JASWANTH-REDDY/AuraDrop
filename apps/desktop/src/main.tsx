import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DesktopIslandOverlay } from './components/DesktopIsland';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import './index.css';

function Root() {
  const [windowLabel, setWindowLabel] = useState<string>('main');

  useEffect(() => {
    try {
      const win = getCurrentWebviewWindow();
      if (win && win.label) {
        setWindowLabel(win.label);
        if (win.label === 'island') {
          document.documentElement.classList.add('island-window');
          document.body.classList.add('island-window');
        }
      }
    } catch (_) {}
  }, []);

  if (windowLabel === 'island') {
    return <DesktopIslandOverlay />;
  }

  return <App />;
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);

