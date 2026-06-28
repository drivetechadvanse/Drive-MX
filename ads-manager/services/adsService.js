export const ADS_COLLECTION = 'ads_manager';
export const ADS_LOCAL_KEY = 'driveMxAdsManagerAds';
export const AD_FALLBACK_TEXT = 'Anúnciate aquí, comunícate al 5617549756';

const safeText = (value = '') => String(value || '').trim();
const safeDocId = (value = '') => safeText(value).replace(/[^a-zA-Z0-9_-]/g, '_');

export function readAdsLocal() {
  try {
    const raw = globalThis.localStorage?.getItem(ADS_LOCAL_KEY) || '[]';
    return normalizeAds(JSON.parse(raw));
  } catch (error) {
    return [];
  }
}

export function writeAdsLocal(ads = []) {
  const normalized = normalizeAds(ads);
  try {
    globalThis.localStorage?.setItem(ADS_LOCAL_KEY, JSON.stringify(normalized));
  } catch (error) {}
  return normalized;
}

export function normalizeAd(ad = {}) {
  const id = safeText(ad.id || ad.adId || ad.uid) || `ad_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const imageUrl = safeText(ad.imageUrl || ad.image || ad.url || '');
  return {
    id,
    adId: safeText(ad.adId || id) || id,
    imageUrl,
    image: imageUrl,
    fileName: safeText(ad.fileName || ad.name || 'Anuncio'),
    active: ad.active !== false,
    storagePath: safeText(ad.storagePath || ''),
    createdAt: Number(ad.createdAt || Date.now()),
    updatedAt: Number(ad.updatedAt || ad.createdAt || Date.now()),
    createdBy: safeText(ad.createdBy || ad.ownerEmail || ''),
    updatedBy: safeText(ad.updatedBy || ad.createdBy || '')
  };
}

export function normalizeAds(ads = []) {
  const byId = new Map();
  (Array.isArray(ads) ? ads : []).filter(Boolean).forEach((ad) => {
    const normalized = normalizeAd(ad);
    byId.set(normalized.id, normalized);
  });
  return Array.from(byId.values()).sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0));
}

export function getActiveAds(ads = []) {
  return normalizeAds(ads).filter((ad) => ad.active !== false && Boolean(ad.imageUrl));
}

export function getAdsCollectionRef({ fbase, appId }) {
  const db = fbase.getFirestore();
  return fbase.collection(db, 'artifacts', appId, 'public', 'data', ADS_COLLECTION);
}

export function getAdDocRef({ fbase, appId, adId }) {
  const db = fbase.getFirestore();
  return fbase.doc(db, 'artifacts', appId, 'public', 'data', ADS_COLLECTION, adId);
}

export function subscribeAds({ fbase, appId, onChange, onError }) {
  if (!fbase || !appId || typeof onChange !== 'function') return () => {};
  try {
    onChange(readAdsLocal());
    const adCol = getAdsCollectionRef({ fbase, appId });
    return fbase.onSnapshot(adCol, (snapshot) => {
      const ads = [];
      snapshot.forEach((docSnap) => ads.push({ id: docSnap.id, ...docSnap.data() }));
      onChange(writeAdsLocal(ads));
    }, (error) => {
      console.error('Firestore anuncios publicitarios:', error);
      if (typeof onError === 'function') onError(error);
    });
  } catch (error) {
    console.error('Suscripción anuncios publicitarios:', error);
    if (typeof onError === 'function') onError(error);
    return () => {};
  }
}

export async function uploadAdImage({ fbase, file }) {
  if (!fbase?.getStorage || !fbase?.ref || !fbase?.uploadBytes || !fbase?.getDownloadURL) {
    throw new Error('Firebase Storage no está disponible para subir anuncios.');
  }
  if (!file) throw new Error('Selecciona una imagen para subir.');
  const storage = fbase.getStorage();
  const cleanName = safeText(file.name || 'anuncio').replace(/[^a-zA-Z0-9._-]/g, '_');
  const id = `ad_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const storagePath = `ads-manager/${id}/${cleanName}`;
  const imageRef = fbase.ref(storage, storagePath);
  await fbase.uploadBytes(imageRef, file, { contentType: file.type || 'image/*' });
  const imageUrl = await fbase.getDownloadURL(imageRef);
  return { id, imageUrl, storagePath, fileName: file.name || cleanName };
}

export async function saveAd({ fbase, appId, ad }) {
  const normalized = normalizeAd(ad);
  const adId = safeDocId(normalized.id);
  if (!adId) throw new Error('No se pudo generar el ID del anuncio.');
  normalized.id = adId;
  normalized.adId = adId;
  await fbase.setDoc(getAdDocRef({ fbase, appId, adId }), normalized);
  return normalized;
}

export async function createAdFromFile({ fbase, appId, file, currentUser }) {
  const uploaded = await uploadAdImage({ fbase, file });
  const email = safeText(currentUser?.email || currentUser?.userEmail || '');
  return saveAd({
    fbase,
    appId,
    ad: {
      ...uploaded,
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: email,
      updatedBy: email
    }
  });
}

export async function toggleAd({ fbase, appId, ad, currentUser }) {
  const normalized = normalizeAd(ad);
  const email = safeText(currentUser?.email || currentUser?.userEmail || '');
  return saveAd({
    fbase,
    appId,
    ad: {
      ...normalized,
      active: normalized.active === false,
      updatedAt: Date.now(),
      updatedBy: email
    }
  });
}

export async function deleteAd({ fbase, appId, ad }) {
  const adId = safeDocId(ad?.id || ad?.adId || '');
  if (!adId) return;
  await fbase.deleteDoc(getAdDocRef({ fbase, appId, adId }));
}

export function buildInventoryItemsWithAds(products = []) {
  const items = [];
  (Array.isArray(products) ? products : []).forEach((product, index) => {
    items.push({ type: 'product', product, key: `product_${product?.id || index}` });
    if ((index + 1) % 4 === 0) {
      items.push({ type: 'ad', slotIndex: Math.floor(index / 4), key: `ad_slot_${Math.floor(index / 4)}_${index}` });
    }
  });
  return items;
}
