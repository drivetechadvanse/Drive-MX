import { AdminPanel } from './components/AdminPanel.js?v=20260831-stripe-wallet-v1';
import { AdminTrackingPanel } from './components/AdminTrackingPanel.js';
import * as PanelControlServices from './services/panelControlService.js';

function injectStyles() {
  const id = 'drive-mx-panel-control-stylesheet';
  if (!globalThis.document || globalThis.document.getElementById(id)) return;
  const link = globalThis.document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = new URL('./panel-control.css', import.meta.url).href;
  globalThis.document.head.appendChild(link);
}

injectStyles();

globalThis.DriveMxPanelControlUI = {
  AdminPanel,
  AdminTrackingPanel,
  services: PanelControlServices
};
