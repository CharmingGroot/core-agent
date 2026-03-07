import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './components/App.js';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
