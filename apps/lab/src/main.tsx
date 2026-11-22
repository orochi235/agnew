/// <reference types="@weasel-js/icons-plugin/virtual" />
import '@weasel-js/labkit/styles.css';
import { IconRegistryProvider } from '@weasel-js/icons/react';
import icons from 'virtual:weasel-icons';
import './app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <IconRegistryProvider icons={icons}>
      <App />
    </IconRegistryProvider>
  </StrictMode>,
);
