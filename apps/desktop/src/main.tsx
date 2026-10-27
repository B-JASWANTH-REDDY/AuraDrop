import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DesktopIslandOverlay } from './components/DesktopIsland';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import './index.css';

function getInitialWindowLabel(): string {
  try {
    const win = getCurrentWebviewWindow();
    return win?.label || 'main';
  } catch {
    return 'main';
  }
}

const initialLabel = getInitialWindowLabel();
if (initialLabel === 'island') {
  document.documentElement.classList.add('island-window');
  document.body.classList.add('island-window');
}

function Root() {
  const [windowLabel, setWindowLabel] = useState<string>(initialLabel);

  useEffect(() => {
    try {
      const win = getCurrentWebviewWindow();
      if (win && win.label && win.label !== windowLabel) {
        setWindowLabel(win.label);
        if (win.label === 'island') {
          document.documentElement.classList.add('island-window');
          document.body.classList.add('island-window');
        }
      }
    } catch (_) {}
  }, [windowLabel]);

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

