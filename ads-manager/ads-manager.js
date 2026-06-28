import {
  ADS_COLLECTION,
  ADS_LOCAL_KEY,
  AD_FALLBACK_TEXT,
  readAdsLocal,
  writeAdsLocal,
  normalizeAd,
  normalizeAds,
  getActiveAds,
  subscribeAds,
  createAdFromFile,
  uploadAdImage,
  saveAd,
  toggleAd,
  deleteAd,
  buildInventoryItemsWithAds
} from './services/adsService.js';
import { PublicInventoryGrid } from './components/PublicInventoryGrid.js';
import { AdminAdsPanel } from './components/AdminAdsPanel.js';

function injectStyles() {
  const id = 'drive-mx-ads-manager-stylesheet';
  if (!globalThis.document || globalThis.document.getElementById(id)) return;
  const link = globalThis.document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = new URL('./ads-manager.css', import.meta.url).href;
  globalThis.document.head.appendChild(link);
}

injectStyles();

globalThis.DriveMxAdsManager = {
  ADS_COLLECTION,
  ADS_LOCAL_KEY,
  AD_FALLBACK_TEXT,
  readAdsLocal,
  writeAdsLocal,
  normalizeAd,
  normalizeAds,
  getActiveAds,
  subscribeAds,
  createAdFromFile,
  uploadAdImage,
  saveAd,
  toggleAd,
  deleteAd,
  buildInventoryItemsWithAds,
  PublicInventoryGrid,
  AdminAdsPanel
};
