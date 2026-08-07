(function (global) {
  'use strict';

  const React = global.React;
  if (!React) throw new Error('DriveMxProductsCore: React no está disponible.');

  const { useState, useEffect, useCallback } = React;

  const PUBLIC_PRODUCTS_COLLECTION = 'products';
  const ADMIN_PRODUCTS_COLLECTION = 'admin_products';
  const USER_PRODUCTS_COLLECTION = 'user_products';
  const USER_SALES_COLLECTION = 'user_sales';
  const PRODUCT_ORIGIN_CONTROL = 'panel_control';
  const PRODUCT_ORIGIN_USER = 'usuario';
  const PUBLIC_PRODUCTS_LOCAL_KEY = 'driveMxProducts';
  const ADMIN_PRODUCTS_LOCAL_KEY = 'driveMxAdminProducts';
  const PRODUCT_SIZE_OPTIONS = ['Chica', 'Mediana', 'Grande', 'XL'];

  const readLocal = (key, fallback = []) => {
    try {
      const value = JSON.parse(global.localStorage.getItem(key) || 'null');
      return value == null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  };

  const writeLocal = (key, data) => {
    try {
      global.localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {}
  };

  const safeDocumentId = (value = '') => String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const normalizeOwnerValue = (value = '') => String(value || '').trim();
  const getProductOwnerId = (product = {}) => product.ownerId || product.sellerId || product.userId || product.createdByUid || '';
  const getProductPublicationType = (product = {}) => String(product.publicationType || product.productOrigin || product.sourcePanel || product.createdFromPanel || '').toLowerCase().trim();

  const isUserPanelPublication = (product = {}) => {
    const type = getProductPublicationType(product);
    return type === PRODUCT_ORIGIN_USER
      || type === 'user'
      || type === 'panel_usuario'
      || type === 'panel-usuario'
      || type === 'panel de usuario'
      || Boolean(getProductOwnerId(product));
  };

  const isControlPanelProduct = (product = {}) => {
    const type = getProductPublicationType(product);
    if (isUserPanelPublication(product)) return false;
    return type === PRODUCT_ORIGIN_CONTROL
      || type === 'control'
      || type === 'admin'
      || type === 'panel de control'
      || !type;
  };

  const normalizeProductSizes = (sizes = []) => Array.isArray(sizes)
    ? sizes.map((size) => String(size || '').trim()).filter((size) => PRODUCT_SIZE_OPTIONS.includes(size))
    : [];

  const normalizeProductColors = (colors = []) => Array.isArray(colors)
    ? colors.map((color) => String(color || '').trim()).filter(Boolean)
    : [];

  const getProductGallery = (product = {}) => {
    const legacyImage = product.imageUrl || product.image || '';
    const gallery = Array.isArray(product.images) ? product.images.filter(Boolean) : [];
    if (gallery.length > 0) return gallery.slice(0, 5);
    return legacyImage ? [legacyImage] : [];
  };

  const sortProducts = (items = []) => [...items].sort((a, b) => Number(b?.updatedAt || b?.createdAt || 0) - Number(a?.updatedAt || a?.createdAt || 0));

  const ensureProductId = (product = {}, fallbackId = '') => {
    const id = String(product.id || fallbackId || '').trim();
    return id ? { ...product, id } : { ...product };
  };

  function usePublicProducts({ fbase, appId, enabled = true } = {}) {
    const [products, setProducts] = useState(() => {
      const cached = readLocal(PUBLIC_PRODUCTS_LOCAL_KEY, []);
      return Array.isArray(cached) ? cached.map((item) => ensureProductId(item)).filter((item) => item.id) : [];
    });

    useEffect(() => {
      if (!enabled || !fbase || !appId) return undefined;
      let unsubscribe = () => {};
      try {
        const db = fbase.getFirestore();
        const productsRef = fbase.collection(db, 'artifacts', appId, 'public', 'data', PUBLIC_PRODUCTS_COLLECTION);
        unsubscribe = fbase.onSnapshot(productsRef, (snapshot) => {
          const next = [];
          snapshot.forEach((documentSnapshot) => {
            const product = ensureProductId(documentSnapshot.data() || {}, documentSnapshot.id);
            if (product.id) next.push(product);
          });
          const sorted = sortProducts(next);
          setProducts(sorted);
          writeLocal(PUBLIC_PRODUCTS_LOCAL_KEY, sorted);
        }, (error) => {
          console.error('Firestore productos públicos:', error);
        });
      } catch (error) {
        console.error('Inicializar productos públicos:', error);
      }
      return () => unsubscribe?.();
    }, [enabled, fbase, appId]);

    const replaceProducts = useCallback((nextValue) => {
      setProducts((previous) => {
        const resolved = typeof nextValue === 'function' ? nextValue(previous) : nextValue;
        const normalized = Array.isArray(resolved)
          ? resolved.map((item) => ensureProductId(item)).filter((item) => item.id)
          : [];
        writeLocal(PUBLIC_PRODUCTS_LOCAL_KEY, normalized);
        return normalized;
      });
    }, []);

    const upsertLocal = useCallback((product = {}) => {
      const normalized = ensureProductId(product);
      if (!normalized.id) return null;
      replaceProducts((previous) => sortProducts([
        normalized,
        ...previous.filter((item) => String(item.id) !== String(normalized.id))
      ]));
      return normalized;
    }, [replaceProducts]);

    const patchLocal = useCallback((productId, patch = {}) => {
      const id = String(productId || '').trim();
      if (!id) return;
      replaceProducts((previous) => previous.map((item) => String(item.id) === id ? { ...item, ...patch, id } : item));
    }, [replaceProducts]);

    const removeLocal = useCallback((productId) => {
      const id = String(productId || '').trim();
      if (!id) return;
      replaceProducts((previous) => previous.filter((item) => String(item.id) !== id));
    }, [replaceProducts]);

    const savePublicProduct = useCallback(async (product = {}, options = {}) => {
      const normalized = ensureProductId(product);
      if (!normalized.id) throw new Error('El producto no tiene un ID válido.');
      const {
        merge = false,
        applyLocalOnError = true,
        applyLocalImmediately = false
      } = options || {};

      if (applyLocalImmediately) upsertLocal(normalized);
      try {
        const db = fbase.getFirestore();
        const productRef = fbase.doc(db, 'artifacts', appId, 'public', 'data', PUBLIC_PRODUCTS_COLLECTION, normalized.id);
        if (merge) await fbase.setDoc(productRef, normalized, { merge: true });
        else await fbase.setDoc(productRef, normalized);
        upsertLocal(normalized);
        return normalized;
      } catch (error) {
        console.error('Guardar producto público:', error);
        if (applyLocalOnError) upsertLocal(normalized);
        throw error;
      }
    }, [fbase, appId, upsertLocal]);

    const deletePublicProduct = useCallback(async (productId, options = {}) => {
      const id = String(productId || '').trim();
      if (!id) return false;
      const { restoreOnError = true } = options || {};
      const previousProduct = products.find((item) => String(item.id) === id) || null;
      removeLocal(id);
      try {
        const db = fbase.getFirestore();
        await fbase.deleteDoc(fbase.doc(db, 'artifacts', appId, 'public', 'data', PUBLIC_PRODUCTS_COLLECTION, id));
        return true;
      } catch (error) {
        console.error('Eliminar producto público:', error);
        if (restoreOnError && previousProduct) upsertLocal(previousProduct);
        throw error;
      }
    }, [fbase, appId, products, removeLocal, upsertLocal]);

    const findById = useCallback((productId) => products.find((item) => String(item.id) === String(productId)) || null, [products]);

    return {
      products,
      setProducts: replaceProducts,
      upsertLocal,
      patchLocal,
      removeLocal,
      savePublicProduct,
      deletePublicProduct,
      findById
    };
  }

  global.DriveMxProductsCore = {
    PUBLIC_PRODUCTS_COLLECTION,
    ADMIN_PRODUCTS_COLLECTION,
    USER_PRODUCTS_COLLECTION,
    USER_SALES_COLLECTION,
    PRODUCT_ORIGIN_CONTROL,
    PRODUCT_ORIGIN_USER,
    PUBLIC_PRODUCTS_LOCAL_KEY,
    ADMIN_PRODUCTS_LOCAL_KEY,
    PRODUCT_SIZE_OPTIONS,
    readLocal,
    writeLocal,
    safeDocumentId,
    normalizeOwnerValue,
    getProductOwnerId,
    getProductPublicationType,
    isUserPanelPublication,
    isControlPanelProduct,
    normalizeProductSizes,
    normalizeProductColors,
    getProductGallery,
    sortProducts,
    ensureProductId,
    usePublicProducts
  };
})(window);
