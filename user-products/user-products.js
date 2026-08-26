(function (global) {
  'use strict';

  const React = global.React;
  if (!React) throw new Error('DriveMxUserProducts: React no está disponible.');

  const { useState, useEffect, useMemo, useCallback } = React;
  const Core = global.DriveMxProductsCore;
  if (!Core) throw new Error('DriveMxUserProducts: products-core no está disponible.');

  const EMPTY_FORM = {
    id: '', name: '', price: '', stock: '', description: '', specifications: '',
    sizes: [], colors: [''], images: [], image: '', imageUrl: '', active: true
  };

  const getUserProfileId = (user = {}) => Core.normalizeOwnerValue(user.uid || user.id);
  const getUserProfileEmail = (user = {}) => String(user.email || '').trim().toLowerCase();
  const getSaleRecordId = (sale = {}) => Core.normalizeOwnerValue(sale.id || sale.saleId);
  const getSaleOwnerId = (sale = {}) => Core.normalizeOwnerValue(sale.sellerId || sale.ownerId || sale.userId);
  const getSaleOwnerEmail = (sale = {}) => String(sale.sellerEmail || sale.ownerEmail || sale.userEmail || '').trim().toLowerCase();

  const isSaleOwnedByUser = (sale = {}, user = {}) => {
    const saleOwnerId = getSaleOwnerId(sale);
    const saleOwnerEmail = getSaleOwnerEmail(sale);
    const userId = getUserProfileId(user);
    const userEmail = getUserProfileEmail(user);
    return Boolean((saleOwnerId && userId && saleOwnerId === userId) || (saleOwnerEmail && userEmail && saleOwnerEmail === userEmail));
  };

  const isProductOwnedByUserProfile = (product = {}, user = {}) => {
    const ownerId = Core.normalizeOwnerValue(Core.getProductOwnerId(product));
    const ownerEmail = String(product.ownerEmail || product.sellerEmail || '').trim().toLowerCase();
    const userId = getUserProfileId(user);
    const userEmail = getUserProfileEmail(user);
    return Boolean((ownerId && userId && ownerId === userId) || (ownerEmail && userEmail && ownerEmail === userEmail));
  };

  const getSellerInfoForProduct = (product = {}, users = []) => {
    const ownerId = Core.normalizeOwnerValue(Core.getProductOwnerId(product));
    const productEmail = String(product.ownerEmail || product.sellerEmail || '').trim().toLowerCase();
    const sellerById = (Array.isArray(users) ? users : []).find((user) => Core.normalizeOwnerValue(user.id || user.uid) === ownerId);
    const sellerByEmail = (Array.isArray(users) ? users : []).find((user) => productEmail && String(user.email || '').trim().toLowerCase() === productEmail);
    const seller = sellerById || sellerByEmail || {};
    return {
      id: ownerId || seller.id || seller.uid || '',
      name: seller.name || product.ownerName || product.sellerName || '',
      email: seller.email || product.ownerEmail || product.sellerEmail || '',
      phone: seller.phone || product.ownerPhone || product.sellerPhone || '',
      saleNotificationEmail: seller.saleNotificationEmail || product.saleNotificationEmail || product.sellerNotificationEmail || product.notificationEmail || seller.email || product.ownerEmail || product.sellerEmail || ''
    };
  };

  const revokePreview = (item) => {
    if (!item?.preview) return;
    try { global.URL.revokeObjectURL(item.preview); } catch (error) {}
  };

  const createFormState = (overrides = {}) => {
    const Supermercado = global.DriveMxSupermercado || global.DriveMxSupermercadoCore || {};
    if (typeof Supermercado.createProductFormState === 'function') return Supermercado.createProductFormState({ ...EMPTY_FORM, ...overrides }, overrides);
    return { ...EMPTY_FORM, ...overrides };
  };

  const buildUserProductRef = ({ fbase, appId, ownerId, productId }) => {
    const safeOwnerId = Core.safeDocumentId(ownerId);
    return fbase.doc(fbase.getFirestore(), 'artifacts', appId, 'public', 'data', Core.USER_PRODUCTS_COLLECTION, safeOwnerId, 'items', String(productId));
  };

  async function saveCompletedSaleMirror({ fbase, appId, sale = {} } = {}) {
    const saleId = getSaleRecordId(sale);
    const ownerId = getSaleOwnerId(sale);
    const userDocId = Core.safeDocumentId(ownerId);
    if (!saleId || !userDocId) return null;
    const normalizedSale = {
      ...sale,
      id: saleId,
      saleId: sale.saleId || saleId,
      sellerId: ownerId,
      visibleToUserId: ownerId,
      updatedAt: sale.updatedAt || Date.now()
    };
    const mirrorRef = fbase.doc(fbase.getFirestore(), 'artifacts', appId, 'public', 'data', Core.USER_SALES_COLLECTION, userDocId, 'items', saleId);
    const existing = await fbase.getDoc(mirrorRef);
    if (existing.exists()) return { id: existing.id, ...existing.data() };
    await fbase.setDoc(mirrorRef, normalizedSale);
    return normalizedSale;
  }

  async function deleteCompletedSaleMirror({ fbase, appId, sale = {} } = {}) {
    const saleId = getSaleRecordId(sale);
    const userDocId = Core.safeDocumentId(getSaleOwnerId(sale));
    if (!saleId || !userDocId) return false;
    await fbase.deleteDoc(fbase.doc(fbase.getFirestore(), 'artifacts', appId, 'public', 'data', Core.USER_SALES_COLLECTION, userDocId, 'items', saleId));
    return true;
  }

  function useUserProductsManager({
    fbase,
    appId,
    fbUser,
    sessionUser,
    users = [],
    publicProducts,
    wallets = [],
    walletSettings = {},
    Wallet = global.DriveMxWallet,
    ensureAccountAllowed = () => true,
    supermarketAccessManager = null,
    onSessionUserChange = () => {}
  } = {}) {
    const [userPanelProducts, setUserPanelProducts] = useState([]);
    const [userCompletedSales, setUserCompletedSales] = useState([]);
    const [saleNotificationEmail, setSaleNotificationEmail] = useState('');
    const [saleNotificationSaving, setSaleNotificationSaving] = useState(false);
    const [userProductForm, setUserProductForm] = useState(() => createFormState());
    const [userProductImageFiles, setUserProductImageFiles] = useState([]);
    const [userProductUploading, setUserProductUploading] = useState(false);
    const [editingUserProductId, setEditingUserProductId] = useState(null);
    const BusinessStorefronts = global.DriveMxBusinessStorefronts || {};
    const initialBusinessOwnerKey = getUserProfileId(sessionUser || {}) || 'usuario';
    const [businessName, setBusinessName] = useState(() => {
      if (typeof BusinessStorefronts.getPreferredBusinessName === 'function') {
        return BusinessStorefronts.getPreferredBusinessName([], sessionUser || {}, initialBusinessOwnerKey, '');
      }
      return String(sessionUser?.businessName || '').trim();
    });
    const [businessNameSaving, setBusinessNameSaving] = useState(false);

    const sessionUserId = getUserProfileId(sessionUser || {});
    const businessOwnerKey = sessionUserId || initialBusinessOwnerKey;
    const safeSessionUserId = Core.safeDocumentId(sessionUserId);
    const sessionEmail = getUserProfileEmail(sessionUser || {});
    const publicList = Array.isArray(publicProducts?.products) ? publicProducts.products : [];

    useEffect(() => {
      if (!sessionUser || sessionUser.role === 'admin') {
        setSaleNotificationEmail('');
        return;
      }
      setSaleNotificationEmail(sessionUser.saleNotificationEmail || sessionUser.email || '');
    }, [sessionUser?.uid, sessionUser?.id, sessionUser?.email, sessionUser?.saleNotificationEmail, sessionUser?.role]);

    useEffect(() => {
      if (!fbUser || !sessionUser || sessionUser.role === 'admin' || !safeSessionUserId) {
        setUserPanelProducts([]);
        return undefined;
      }
      const localKey = `driveMxUserProducts_${safeSessionUserId}`;
      const cached = Core.readLocal(localKey, []);
      setUserPanelProducts(Array.isArray(cached) ? Core.sortProducts(cached.filter((product) => !Core.getProductOwnerId(product) || isProductOwnedByUserProfile(product, sessionUser))) : []);
      const collectionRef = fbase.collection(fbase.getFirestore(), 'artifacts', appId, 'public', 'data', Core.USER_PRODUCTS_COLLECTION, safeSessionUserId, 'items');
      const unsubscribe = fbase.onSnapshot(collectionRef, (snapshot) => {
        const next = [];
        snapshot.forEach((documentSnapshot) => {
          const product = Core.ensureProductId(documentSnapshot.data() || {}, documentSnapshot.id);
          if (product.id && (!Core.getProductOwnerId(product) || isProductOwnedByUserProfile(product, sessionUser))) next.push(product);
        });
        const sorted = Core.sortProducts(next);
        setUserPanelProducts(sorted);
        Core.writeLocal(localKey, sorted);
      }, (error) => console.error('Firestore productos Panel de Usuario:', error));
      return () => unsubscribe?.();
    }, [fbUser, fbase, appId, safeSessionUserId, sessionUser?.role, sessionEmail]);

    useEffect(() => {
      if (!fbUser || !sessionUser || sessionUser.role === 'admin' || !safeSessionUserId) {
        setUserCompletedSales([]);
        return undefined;
      }
      const localKey = `driveMxUserCompletedSales_${safeSessionUserId}`;
      const cached = Core.readLocal(localKey, []);
      setUserCompletedSales(Array.isArray(cached) ? cached.filter((sale) => isSaleOwnedByUser(sale, sessionUser)) : []);
      const collectionRef = fbase.collection(fbase.getFirestore(), 'artifacts', appId, 'public', 'data', Core.USER_SALES_COLLECTION, safeSessionUserId, 'items');
      const unsubscribe = fbase.onSnapshot(collectionRef, (snapshot) => {
        const next = [];
        snapshot.forEach((documentSnapshot) => {
          const sale = { id: documentSnapshot.id, ...documentSnapshot.data() };
          if (isSaleOwnedByUser(sale, sessionUser)) next.push(sale);
        });
        next.sort((a, b) => Number(b.soldAt || b.createdAt || 0) - Number(a.soldAt || a.createdAt || 0));
        setUserCompletedSales(next);
        Core.writeLocal(localKey, next);
      }, (error) => console.error('Firestore ventas realizadas Panel de Usuario:', error));
      return () => unsubscribe?.();
    }, [fbUser, fbase, appId, safeSessionUserId, sessionUser?.role, sessionEmail]);

    const replaceUserProducts = useCallback((nextValue, ownerId = safeSessionUserId) => {
      setUserPanelProducts((previous) => {
        const resolved = typeof nextValue === 'function' ? nextValue(previous) : nextValue;
        const normalized = Core.sortProducts((Array.isArray(resolved) ? resolved : []).map((item) => Core.ensureProductId(item)).filter((item) => item.id));
        if (ownerId) Core.writeLocal(`driveMxUserProducts_${ownerId}`, normalized);
        return normalized;
      });
    }, [safeSessionUserId]);

    const upsertUserLocal = useCallback((product = {}) => {
      const normalized = Core.ensureProductId(product);
      if (!normalized.id) return;
      replaceUserProducts((previous) => [normalized, ...previous.filter((item) => String(item.id) !== String(normalized.id))]);
    }, [replaceUserProducts]);

    const patchInventoryLocal = useCallback((productId, patch = {}, ownerId = '') => {
      const id = String(productId || '').trim();
      const safeOwnerId = Core.safeDocumentId(ownerId);
      if (!id || !safeOwnerId || safeOwnerId !== safeSessionUserId) return;
      replaceUserProducts((previous) => previous.map((product) => String(product.id) === id ? { ...product, ...patch, id } : product), safeOwnerId);
    }, [replaceUserProducts, safeSessionUserId]);

    const currentUserProducts = useMemo(() => {
      if (!sessionUser || sessionUser.role === 'admin') return [];
      const byId = new Map();
      userPanelProducts.forEach((product) => {
        if (!product?.id) return;
        if (!Core.getProductOwnerId(product) || isProductOwnedByUserProfile(product, sessionUser)) {
          byId.set(String(product.id), product);
        }
      });
      // El documento público es la fuente principal. Incluir aquí las
      // publicaciones propias permite recuperarlas aunque el espejo privado
      // haya fallado temporalmente, sin mezclar productos de otros usuarios.
      publicList.forEach((product) => {
        if (!product?.id || !Core.isUserPanelPublication(product)) return;
        if (isProductOwnedByUserProfile(product, sessionUser)) byId.set(String(product.id), product);
      });
      return Core.sortProducts(Array.from(byId.values()));
    }, [userPanelProducts, publicList, sessionUser]);

    useEffect(() => {
      if (!sessionUser || sessionUser.role === 'admin') return;
      const module = global.DriveMxBusinessStorefronts || {};
      const preferredName = typeof module.getPreferredBusinessName === 'function'
        ? module.getPreferredBusinessName(currentUserProducts, sessionUser || {}, businessOwnerKey, '')
        : String(sessionUser?.businessName || currentUserProducts.find((product) => product?.businessName)?.businessName || '').trim();
      if (!preferredName) return;
      setBusinessName((previous) => String(previous || '').trim() ? previous : preferredName);
    }, [currentUserProducts, sessionUser?.businessName, sessionUser?.uid, sessionUser?.id, sessionUser?.role, businessOwnerKey]);

    const currentUserSales = useMemo(() => userCompletedSales
      .filter((sale) => isSaleOwnedByUser(sale, sessionUser || {}))
      .sort((a, b) => Number(b.soldAt || b.createdAt || 0) - Number(a.soldAt || a.createdAt || 0)), [userCompletedSales, sessionUser]);

    const resetUserProductForm = useCallback(() => {
      setUserProductForm(createFormState());
      setUserProductImageFiles((previous) => {
        previous.forEach(revokePreview);
        return [];
      });
      setUserProductUploading(false);
      setEditingUserProductId(null);
    }, []);

    const selectUserProductCategory = useCallback((category) => {
      const applyCategory = (nextCategory) => {
        setUserProductForm((previous) => ({ ...previous, category: nextCategory }));
      };
      if (typeof supermarketAccessManager?.requestCategory === 'function') {
        return supermarketAccessManager.requestCategory(category, applyCategory);
      }
      applyCategory(category);
      return true;
    }, [supermarketAccessManager]);

    const saveUserProductMirror = useCallback(async (product = {}, options = {}) => {
      const normalized = Core.ensureProductId(product);
      if (!safeSessionUserId || !normalized.id) throw new Error('No se pudo identificar al propietario del producto.');
      const { throwOnError = false } = options || {};
      upsertUserLocal(normalized);
      try {
        await fbase.setDoc(buildUserProductRef({ fbase, appId, ownerId: safeSessionUserId, productId: normalized.id }), normalized);
        return normalized;
      } catch (error) {
        console.error('Firestore espejo producto usuario:', error);
        if (throwOnError) throw error;
        return normalized;
      }
    }, [safeSessionUserId, fbase, appId, upsertUserLocal]);

    const deleteUserProductMirror = useCallback(async (productId, options = {}) => {
      const id = String(productId || '').trim();
      if (!safeSessionUserId || !id) return false;
      const { throwOnError = false, restoreOnError = true } = options || {};
      const previousProduct = userPanelProducts.find((product) => String(product.id) === id) || null;
      replaceUserProducts((previous) => previous.filter((product) => String(product.id) !== id));
      try {
        await fbase.deleteDoc(buildUserProductRef({ fbase, appId, ownerId: safeSessionUserId, productId: id }));
        return true;
      } catch (error) {
        console.error('Firestore borrar espejo producto usuario:', error);
        if (restoreOnError && previousProduct) upsertUserLocal(previousProduct);
        if (throwOnError) throw error;
        return false;
      }
    }, [safeSessionUserId, userPanelProducts, replaceUserProducts, fbase, appId, upsertUserLocal]);

    const uploadSingleProductImage = useCallback(async (productId, file) => {
      if (!file || !String(file.type || '').startsWith('image/')) throw new Error('Selecciona un archivo de imagen válido.');
      const storage = fbase.getStorage();
      const safeName = String(file.name || 'imagen').replace(/[^a-zA-Z0-9._-]/g, '_');
      const imageRef = fbase.ref(storage, `products/${productId}/${Date.now()}-${safeName}`);
      await fbase.uploadBytes(imageRef, file);
      return await fbase.getDownloadURL(imageRef);
    }, [fbase]);

    const handleUserProductImagesSelect = useCallback((event) => {
      const input = event?.target;
      if (ensureAccountAllowed() === false) {
        if (input) input.value = '';
        return;
      }
      const files = Array.from(input?.files || []).filter((file) => String(file.type || '').startsWith('image/'));
      if (files.length === 0) {
        if (input) input.value = '';
        return;
      }
      const currentCount = (userProductForm.images || []).length + userProductImageFiles.length;
      const availableSlots = Math.max(0, 5 - currentCount);
      if (availableSlots === 0) {
        alert('Solo puedes guardar hasta 5 fotografías por producto.');
        if (input) input.value = '';
        return;
      }
      const selected = files.slice(0, availableSlots).map((file) => ({ file, preview: global.URL.createObjectURL(file) }));
      if (files.length > availableSlots) alert('Solo se agregaron las fotografías permitidas hasta completar 5.');
      setUserProductImageFiles((previous) => [...previous, ...selected]);
      if (input) input.value = '';
    }, [ensureAccountAllowed, userProductForm.images, userProductImageFiles.length]);

    const removeExistingUserProductImage = useCallback((index) => {
      setUserProductForm((previous) => ({ ...previous, images: (previous.images || []).filter((_, imageIndex) => imageIndex !== index) }));
    }, []);

    const removeNewUserProductImage = useCallback((index) => {
      setUserProductImageFiles((previous) => {
        revokePreview(previous[index]);
        return previous.filter((_, imageIndex) => imageIndex !== index);
      });
    }, []);

    const replaceExistingUserProductImage = useCallback(async (index, event) => {
      const input = event?.target;
      const file = input?.files?.[0];
      if (input) input.value = '';
      if (!file || ensureAccountAllowed() === false) return;
      if (!String(file.type || '').startsWith('image/')) {
        alert('Selecciona un archivo de imagen válido.');
        return;
      }
      const id = editingUserProductId || userProductForm.id;
      const existing = currentUserProducts.find((product) => String(product.id) === String(id));
      if (!id || (editingUserProductId && !existing)) {
        alert('Guarda primero tu publicación para poder reemplazar fotografías existentes.');
        return;
      }
      setUserProductUploading(true);
      try {
        const url = await uploadSingleProductImage(id, file);
        setUserProductForm((previous) => {
          const images = [...(previous.images || [])];
          images[index] = url;
          return { ...previous, images, image: images[0] || '', imageUrl: images[0] || '' };
        });
      } catch (error) {
        console.error('Storage reemplazar foto usuario:', error);
        alert(error?.message || 'No se pudo reemplazar la fotografía.');
      } finally {
        setUserProductUploading(false);
      }
    }, [ensureAccountAllowed, editingUserProductId, userProductForm.id, currentUserProducts, uploadSingleProductImage]);

    const ensurePublicationWalletAllowed = useCallback(({ productPrice = 0, willBeActive = true } = {}) => {
      if (!Wallet || typeof Wallet.validatePublication !== 'function') return true;
      const commissionPercent = Wallet.normalizePercent(walletSettings.globalCommissionPercent);
      const currentWallet = Wallet.findWalletForUser(wallets, sessionUser || {});
      const activeCount = currentUserProducts.filter((product) => product.active !== false).length;
      const validation = Wallet.validatePublication({
        wallet: currentWallet,
        productPrice,
        commissionPercent,
        willBeActive,
        userProductCount: activeCount
      });
      if (!validation.ok) {
        alert(validation.message || Wallet.INSUFFICIENT_MESSAGE);
        return false;
      }
      return true;
    }, [Wallet, walletSettings, wallets, sessionUser, currentUserProducts]);

    const handleUserProductSubmit = useCallback(async (event) => {
      event?.preventDefault?.();
      if (ensureAccountAllowed() === false) return;
      if (!sessionUserId) {
        alert('Inicia sesión para administrar tus publicaciones.');
        return;
      }
      const SupermarketAccessModule = global.DriveMxSupermarketAccess || {};
      const isSupermarket = typeof SupermarketAccessModule.isSupermarketCategory === 'function'
        ? SupermarketAccessModule.isSupermarketCategory(userProductForm.category)
        : String(userProductForm.category || '').trim().toLowerCase() === 'supermercado';
      if (isSupermarket && sessionUser?.role !== 'admin' && supermarketAccessManager?.authorized !== true) {
        if (typeof supermarketAccessManager?.requestCategory === 'function') {
          supermarketAccessManager.requestCategory(userProductForm.category, (category) => {
            setUserProductForm((previous) => ({ ...previous, category }));
          });
        } else {
          alert('No se pudo validar el acceso a Supermercado. Recarga la aplicación.');
        }
        return;
      }
      const safeOwnerId = safeSessionUserId || `usuario_${Date.now()}`;
      const id = editingUserProductId || userProductForm.id || `userprod_${safeOwnerId}_${Date.now()}`;
      const existing = currentUserProducts.find((product) => String(product.id) === String(id));
      if (editingUserProductId && (!existing || !isProductOwnedByUserProfile(existing, sessionUser))) {
        alert('Solo puedes editar tus propias publicaciones.');
        return;
      }
      const willBeActive = Boolean(userProductForm.active);
      const wasActive = existing?.active !== false;
      const isNewPublication = !editingUserProductId;
      if (willBeActive && (isNewPublication || !wasActive) && !ensurePublicationWalletAllowed({ productPrice: Number(userProductForm.price || 0), willBeActive })) return;
      const name = String(userProductForm.name || '').trim();
      if (!name) {
        alert('Ingresa el nombre del producto.');
        return;
      }
      const businessModule = global.DriveMxBusinessStorefronts || {};
      const normalizedBusinessName = typeof businessModule.normalizeBusinessName === 'function'
        ? businessModule.normalizeBusinessName(businessName)
        : String(businessName || '').trim();
      if (!normalizedBusinessName) {
        alert('Ingresa el nombre del negocio.');
        return;
      }
      setUserProductUploading(true);
      try {
        const Supermercado = global.DriveMxSupermercado || global.DriveMxSupermercadoCore || {};
        const currentImages = Array.isArray(userProductForm.images) ? userProductForm.images.filter(Boolean) : Core.getProductGallery(existing);
        const uploadedImages = [];
        for (const item of userProductImageFiles) uploadedImages.push(await uploadSingleProductImage(id, item.file));
        const images = [...currentImages, ...uploadedImages].filter(Boolean).slice(0, 5);
        const mainImage = images[0] || '';
        const notificationEmail = String(saleNotificationEmail || sessionUser?.saleNotificationEmail || sessionUser?.email || '').trim();
        const baseProduct = {
          ...(existing || {}), id, name,
          price: Number(userProductForm.price || 0),
          stock: Math.max(0, Math.floor(Number(userProductForm.stock || 0))),
          description: String(userProductForm.description || '').trim(),
          specifications: String(userProductForm.specifications || '').trim(),
          sizes: Core.normalizeProductSizes(userProductForm.sizes),
          colors: Core.normalizeProductColors(userProductForm.colors),
          images, image: mainImage, imageUrl: mainImage,
          active: Boolean(userProductForm.active),
          businessName: normalizedBusinessName,
          ownerId: sessionUserId,
          ownerName: sessionUser?.name || '',
          ownerEmail: sessionUser?.email || '',
          ownerPhone: sessionUser?.phone || '',
          saleNotificationEmail: notificationEmail,
          sellerNotificationEmail: notificationEmail,
          publicationType: Core.PRODUCT_ORIGIN_USER,
          sourcePanel: 'panel_usuario',
          updatedAt: Date.now(),
          updatedBy: sessionUser?.email || '',
          createdAt: existing?.createdAt || Date.now(),
          createdBy: existing?.createdBy || sessionUser?.email || ''
        };
        const product = typeof Supermercado.applyCategoryToProduct === 'function' ? Supermercado.applyCategoryToProduct(baseProduct, userProductForm) : baseProduct;
        await publicProducts.savePublicProduct(product, { applyLocalOnError: false });
        await saveUserProductMirror(product);
        if (typeof businessModule.rememberBusinessName === 'function') {
          businessModule.rememberBusinessName(businessOwnerKey, normalizedBusinessName);
        }
        setBusinessName(normalizedBusinessName);
        resetUserProductForm();
        alert('Publicación guardada correctamente. Se mostrará en la portada principal si está activa.');
      } catch (error) {
        console.error('Guardar publicación usuario:', error);
        alert('No se pudo guardar la publicación. Intenta nuevamente.');
        setUserProductUploading(false);
      }
    }, [ensureAccountAllowed, sessionUserId, safeSessionUserId, editingUserProductId, userProductForm, currentUserProducts, sessionUser, ensurePublicationWalletAllowed, supermarketAccessManager, userProductImageFiles, uploadSingleProductImage, saleNotificationEmail, publicProducts, saveUserProductMirror, resetUserProductForm, businessName, businessOwnerKey]);

    const editUserProduct = useCallback((product) => {
      if (ensureAccountAllowed() === false) return;
      if (!isProductOwnedByUserProfile(product, sessionUser || {})) {
        alert('Solo puedes editar tus propias publicaciones.');
        return;
      }
      const images = Core.getProductGallery(product);
      const colors = Core.normalizeProductColors(product.colors || product.colores);
      setUserProductForm(createFormState({
        id: product.id,
        name: product.name || '', price: product.price ?? '', stock: product.stock ?? '',
        description: product.description || '', specifications: product.specifications || '',
        sizes: Core.normalizeProductSizes(product.sizes || product.medidas),
        colors: colors.length ? colors : [''], images,
        image: images[0] || '', imageUrl: images[0] || '', active: product.active !== false,
        category: product.category || product.productCategory || ''
      }));
      setUserProductImageFiles((previous) => { previous.forEach(revokePreview); return []; });
      setEditingUserProductId(product.id);
    }, [ensureAccountAllowed, sessionUser]);

    const toggleUserProduct = useCallback(async (product) => {
      if (ensureAccountAllowed() === false) return;
      if (!isProductOwnedByUserProfile(product, sessionUser || {})) {
        alert('Solo puedes administrar tus propias publicaciones.');
        return;
      }
      const activating = product.active === false;
      if (activating && !ensurePublicationWalletAllowed({ productPrice: Number(product.price || 0), willBeActive: true })) return;
      const next = { ...product, active: product.active === false, updatedAt: Date.now(), updatedBy: sessionUser?.email || '' };
      try {
        await publicProducts.savePublicProduct(next, { applyLocalOnError: false });
        await saveUserProductMirror(next);
      } catch (error) {
        alert('No se pudo actualizar el estado de la publicación.');
      }
    }, [ensureAccountAllowed, sessionUser, ensurePublicationWalletAllowed, publicProducts, saveUserProductMirror]);

    const deleteUserProduct = useCallback(async (product) => {
      if (ensureAccountAllowed() === false) return;
      if (!product?.id || !isProductOwnedByUserProfile(product, sessionUser || {})) {
        alert('Solo puedes eliminar tus propias publicaciones.');
        return;
      }
      if (!global.confirm('¿Eliminar esta publicación?')) return;
      const previous = { ...product };
      let mirrorDeleted = false;
      try {
        await deleteUserProductMirror(product.id, { throwOnError: true, restoreOnError: true });
        mirrorDeleted = true;
        await publicProducts.deletePublicProduct(product.id, { restoreOnError: true });
        if (String(editingUserProductId) === String(product.id)) resetUserProductForm();
      } catch (error) {
        console.error('Firestore borrar publicación usuario:', error);
        if (mirrorDeleted) await saveUserProductMirror(previous);
        publicProducts.upsertLocal(previous);
        upsertUserLocal(previous);
        alert('No se pudo eliminar la publicación.');
      }
    }, [ensureAccountAllowed, sessionUser, publicProducts, deleteUserProductMirror, saveUserProductMirror, editingUserProductId, resetUserProductForm, upsertUserLocal]);

    const saveBusinessName = useCallback(async (event) => {
      event?.preventDefault?.();
      if (ensureAccountAllowed() === false) return;
      if (!sessionUserId) {
        alert('Inicia sesión para guardar el nombre del negocio.');
        return;
      }
      const businessModule = global.DriveMxBusinessStorefronts || {};
      const normalizedBusinessName = typeof businessModule.normalizeBusinessName === 'function'
        ? businessModule.normalizeBusinessName(businessName)
        : String(businessName || '').trim();
      if (!normalizedBusinessName) {
        alert('Ingresa el nombre del negocio.');
        return;
      }

      const updatedAt = Date.now();
      const updatedBy = sessionUser?.email || '';
      const nextProfile = {
        ...(sessionUser || {}),
        uid: sessionUser?.uid || sessionUserId,
        email: sessionUser?.email || '',
        businessName: normalizedBusinessName,
        updatedAt,
        updatedBy
      };

      setBusinessNameSaving(true);
      try {
        const operatorRef = fbase.doc(fbase.getFirestore(), 'artifacts', appId, 'public', 'data', 'operators', sessionUserId);
        await fbase.setDoc(operatorRef, nextProfile, { merge: true });

        for (const product of currentUserProducts) {
          const updatedProduct = {
            ...product,
            businessName: normalizedBusinessName,
            businessNameUpdatedAt: updatedAt,
            updatedBy,
            ownerId: sessionUserId,
            publicationType: Core.PRODUCT_ORIGIN_USER,
            sourcePanel: 'panel_usuario'
          };
          await publicProducts.savePublicProduct(updatedProduct, { applyLocalOnError: false });
          await saveUserProductMirror(updatedProduct);
        }

        if (typeof businessModule.rememberBusinessName === 'function') {
          businessModule.rememberBusinessName(businessOwnerKey, normalizedBusinessName);
        }
        setBusinessName(normalizedBusinessName);
        onSessionUserChange(nextProfile);
        alert('Nombre del negocio guardado correctamente.');
      } catch (error) {
        console.error('Guardar nombre del negocio Panel de Usuario:', error);
        alert('No se pudo guardar el nombre del negocio.');
      } finally {
        setBusinessNameSaving(false);
      }
    }, [ensureAccountAllowed, sessionUserId, sessionUser, businessName, fbase, appId, currentUserProducts, publicProducts, saveUserProductMirror, businessOwnerKey, onSessionUserChange]);

    const saveSaleNotificationEmail = useCallback(async (event) => {
      event?.preventDefault?.();
      if (ensureAccountAllowed() === false) return;
      const email = String(saleNotificationEmail || '').trim();
      if (!sessionUserId) {
        alert('Inicia sesión para guardar el correo de venta.');
        return;
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        alert('Ingresa un correo electrónico válido para notificaciones de venta.');
        return;
      }
      const nextProfile = {
        ...(sessionUser || {}),
        uid: sessionUser?.uid || sessionUserId,
        email: sessionUser?.email || '',
        saleNotificationEmail: email,
        updatedAt: Date.now(),
        updatedBy: sessionUser?.email || ''
      };
      setSaleNotificationSaving(true);
      try {
        const operatorRef = fbase.doc(fbase.getFirestore(), 'artifacts', appId, 'public', 'data', 'operators', sessionUserId);
        await fbase.setDoc(operatorRef, nextProfile, { merge: true });
        for (const product of currentUserProducts) {
          const updatedProduct = { ...product, saleNotificationEmail: email, sellerNotificationEmail: email, updatedAt: Date.now(), updatedBy: sessionUser?.email || '' };
          await publicProducts.savePublicProduct(updatedProduct, { applyLocalOnError: false });
          await saveUserProductMirror(updatedProduct);
        }
        onSessionUserChange(nextProfile);
        alert('Correo para notificaciones de venta guardado correctamente.');
      } catch (error) {
        console.error('Guardar correo de venta:', error);
        alert('No se pudo guardar el correo para notificaciones de venta.');
      } finally {
        setSaleNotificationSaving(false);
      }
    }, [ensureAccountAllowed, saleNotificationEmail, sessionUserId, sessionUser, fbase, appId, currentUserProducts, publicProducts, saveUserProductMirror, onSessionUserChange]);

    const reset = useCallback(() => {
      setUserPanelProducts([]);
      setUserCompletedSales([]);
      setSaleNotificationEmail('');
      setSaleNotificationSaving(false);
      setBusinessName('');
      setBusinessNameSaving(false);
      resetUserProductForm();
    }, [resetUserProductForm]);

    return {
      userPanelProducts,
      userCompletedSales,
      currentUserProducts,
      currentUserSales,
      activeProductCount: currentUserProducts.filter((product) => product.active !== false).length,
      businessName,
      setBusinessName,
      businessNameSaving,
      saveBusinessName,
      saleNotificationEmail,
      setSaleNotificationEmail,
      saleNotificationSaving,
      saveSaleNotificationEmail,
      userProductForm,
      setUserProductForm,
      selectUserProductCategory,
      supermarketAccessManager,
      userProductImageFiles,
      userProductUploading,
      editingUserProductId,
      resetUserProductForm,
      handleUserProductImagesSelect,
      removeExistingUserProductImage,
      removeNewUserProductImage,
      replaceExistingUserProductImage,
      handleUserProductSubmit,
      editUserProduct,
      toggleUserProduct,
      deleteUserProduct,
      saveUserProductMirror,
      deleteUserProductMirror,
      patchInventoryLocal,
      reset
    };
  }

  function UserProductsPanel({ manager, Icons = {} } = {}) {
    if (!manager) return null;
    const TrashIcon = Icons.Trash || (() => null);
    const Supermercado = global.DriveMxSupermercado || global.DriveMxSupermercadoCore || {};
    const SupermarketAccess = global.DriveMxSupermarketAccess || {};
    const BusinessStorefronts = global.DriveMxBusinessStorefronts || {};
    const {
      currentUserProducts, currentUserSales,
      businessName, setBusinessName, businessNameSaving, saveBusinessName,
      saleNotificationEmail, setSaleNotificationEmail, saleNotificationSaving, saveSaleNotificationEmail,
      userProductForm, setUserProductForm, selectUserProductCategory, supermarketAccessManager,
      userProductImageFiles, userProductUploading, editingUserProductId,
      resetUserProductForm, handleUserProductImagesSelect, removeExistingUserProductImage, removeNewUserProductImage,
      replaceExistingUserProductImage, handleUserProductSubmit, editUserProduct, toggleUserProduct, deleteUserProduct
    } = manager;

    return (
      <>
        {BusinessStorefronts.BusinessNameSettings && (
          <BusinessStorefronts.BusinessNameSettings
            value={businessName}
            onChange={setBusinessName}
            saving={businessNameSaving}
            onSubmit={saveBusinessName}
            description="Este nombre identificará tu bloque de publicaciones en Productos Drive MX y Supermercado"
          />
        )}

        <div className="card-glass overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-100 px-6 py-4">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Correo para notificaciones de venta</h2>
            <p className="text-[9px] font-bold text-slate-300 uppercase mt-1">Este correo recibirá el aviso automático cuando una de tus publicaciones sea vendida</p>
          </div>
          <form onSubmit={saveSaleNotificationEmail} className="p-6 grid md:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <label className="block text-[9px] font-black uppercase text-slate-400 mb-2">Correo para notificaciones de venta</label>
              <input required type="email" className="input-field" placeholder="correo@ejemplo.com" value={saleNotificationEmail} onChange={(event) => setSaleNotificationEmail(event.target.value)} />
            </div>
            <button disabled={saleNotificationSaving} type="submit" className="btn-primary h-12 disabled:opacity-50 disabled:cursor-not-allowed">{saleNotificationSaving ? 'Guardando...' : 'Guardar correo'}</button>
          </form>
        </div>

        <div id="user-sales-section" className="card-glass overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-100 px-6 py-4">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ventas Realizadas</h2>
            <p className="text-[9px] font-bold text-slate-300 uppercase mt-1">Historial individual de productos vendidos de este usuario</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-white border-b border-slate-50"><tr className="text-[8px] font-black uppercase text-slate-400"><th className="px-6 py-3">Nombre del producto</th><th className="px-6 py-3">Detalle de venta</th><th className="px-6 py-3">Fecha de venta</th></tr></thead>
              <tbody className="divide-y divide-slate-50">
                {currentUserSales.map((sale) => {
                  const quantity = Math.max(1, Math.floor(Number(sale.quantity || sale.productQuantity || 1)) || 1);
                  const unitPrice = Number(sale.unitPrice ?? sale.productUnitPrice ?? sale.productPrice ?? sale.price ?? 0);
                  const lineTotal = Number(sale.productCost ?? sale.productTotal ?? sale.lineTotal ?? sale.totalPrice ?? (unitPrice * quantity) ?? 0);
                  return <tr key={sale.id || sale.saleId} className="text-[10px] font-bold text-slate-600"><td className="px-6 py-4 font-black text-slate-800">{sale.productName || sale.name || sale.productId || '-'}</td><td className="px-6 py-4"><p className="text-red-600 font-black">${lineTotal.toFixed(2)}</p><p className="text-[8px] text-slate-400 uppercase">Cantidad: {quantity} · Unitario: ${unitPrice.toFixed(2)}</p></td><td className="px-6 py-4">{(sale.soldAt || sale.createdAt) ? new Date(sale.soldAt || sale.createdAt).toLocaleString('es-MX') : '-'}</td></tr>;
                })}
                {currentUserSales.length === 0 && <tr><td colSpan="3" className="px-6 py-8 text-center text-[10px] font-bold text-slate-300 uppercase">Aún no tienes ventas realizadas registradas</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div id="user-products-section" className="card-glass overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex items-center justify-between gap-3">
            <div><h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Administración de Productos</h2><p className="text-[9px] font-bold text-slate-300 uppercase mt-1">Administra únicamente tus publicaciones; las activas se muestran en la portada principal</p></div>
            {editingUserProductId && <button type="button" onClick={resetUserProductForm} className="text-[9px] font-black text-slate-400 uppercase">Cancelar edición</button>}
          </div>
          <div className="p-6 border-b border-slate-50">
            {SupermarketAccess.SupermarketPasswordPrompt && (
              <SupermarketAccess.SupermarketPasswordPrompt manager={supermarketAccessManager} />
            )}
            <form onSubmit={handleUserProductSubmit} className="grid md:grid-cols-5 gap-3">
              <label className="md:col-span-5 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-4 cursor-pointer hover:border-red-200 transition-all">
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleUserProductImagesSelect} />
                <div className="flex items-center justify-between gap-4 flex-wrap"><div><p className="text-[10px] font-black uppercase text-slate-600">Fotografías del producto</p><p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Máximo 5 imágenes JPG, PNG o WebP asociadas al mismo ID</p></div><span className="px-3 py-2 bg-white rounded-xl text-[9px] font-black text-slate-400 uppercase">{(userProductForm.images || []).length + userProductImageFiles.length}/5 fotos</span></div>
              </label>

              {((userProductForm.images || []).length > 0 || userProductImageFiles.length > 0) && <div className="md:col-span-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {(userProductForm.images || []).map((image, index) => <div key={`${image}-${index}`} className="relative rounded-2xl overflow-hidden bg-slate-100 border border-slate-100 group"><img src={image} alt={`Foto ${index + 1}`} className="w-full aspect-square object-cover" /><div className="absolute inset-x-2 bottom-2 flex gap-1"><label className="flex-1 text-center bg-white/90 rounded-lg px-2 py-1 text-[7px] font-black uppercase cursor-pointer">Reemplazar<input type="file" accept="image/*" className="hidden" onChange={(event) => replaceExistingUserProductImage(index, event)} /></label><button type="button" onClick={() => removeExistingUserProductImage(index)} className="flex-1 bg-red-500 text-white rounded-lg px-2 py-1 text-[7px] font-black uppercase">Eliminar</button></div></div>)}
                {userProductImageFiles.map((item, index) => <div key={item.preview} className="relative rounded-2xl overflow-hidden bg-slate-100 border border-dashed border-red-200"><img src={item.preview} alt={`Nueva foto ${index + 1}`} className="w-full aspect-square object-cover" /><button type="button" onClick={() => removeNewUserProductImage(index)} className="absolute inset-x-2 bottom-2 bg-red-500 text-white rounded-lg px-2 py-1 text-[7px] font-black uppercase">Quitar</button></div>)}
              </div>}

              {Supermercado.ProductCategorySelect && <Supermercado.ProductCategorySelect value={userProductForm.category || ''} onChange={selectUserProductCategory} />}
              <input required className="input-field md:col-span-2" placeholder="NOMBRE" value={userProductForm.name || ''} onChange={(event) => setUserProductForm((previous) => ({ ...previous, name: event.target.value }))} />
              <input required type="number" min="0" step="0.01" className="input-field" placeholder="PRECIO" value={userProductForm.price ?? ''} onChange={(event) => setUserProductForm((previous) => ({ ...previous, price: event.target.value }))} />
              <input required type="number" min="0" step="1" className="input-field" placeholder="INVENTARIO" value={userProductForm.stock ?? ''} onChange={(event) => setUserProductForm((previous) => ({ ...previous, stock: event.target.value }))} />
              <label className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-500 bg-slate-50 rounded-xl px-4 py-3"><input type="checkbox" checked={Boolean(userProductForm.active)} onChange={(event) => setUserProductForm((previous) => ({ ...previous, active: event.target.checked }))} />Activo</label>

              <div className="md:col-span-5 bg-slate-50 rounded-2xl p-4 space-y-3"><p className="text-[10px] font-black uppercase text-slate-600">Medidas opcionales</p><div className="flex flex-wrap gap-2">{Core.PRODUCT_SIZE_OPTIONS.map((size) => { const selected = Core.normalizeProductSizes(userProductForm.sizes).includes(size); return <label key={size} className={`px-3 py-2 rounded-xl border text-[9px] font-black uppercase cursor-pointer ${selected ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white border-slate-100 text-slate-400'}`}><input type="checkbox" className="hidden" checked={selected} onChange={(event) => setUserProductForm((previous) => ({ ...previous, sizes: event.target.checked ? [...Core.normalizeProductSizes(previous.sizes), size] : Core.normalizeProductSizes(previous.sizes).filter((item) => item !== size) }))} />{size}</label>; })}</div></div>
              <div className="md:col-span-5 bg-slate-50 rounded-2xl p-4 space-y-3"><div className="flex items-center justify-between gap-3"><p className="text-[10px] font-black uppercase text-slate-600">Colores opcionales</p><button type="button" onClick={() => setUserProductForm((previous) => ({ ...previous, colors: [...(previous.colors || ['']), ''] }))} className="px-3 py-2 bg-white border border-slate-100 rounded-xl text-[10px] font-black text-red-500">+</button></div>{(userProductForm.colors || ['']).map((color, index) => <div key={index} className="flex gap-2"><input className="input-field" placeholder="COLOR" value={color || ''} onChange={(event) => setUserProductForm((previous) => { const colors = [...(previous.colors || [''])]; colors[index] = event.target.value; return { ...previous, colors }; })} /><button type="button" onClick={() => setUserProductForm((previous) => { const colors = (previous.colors || ['']).filter((_, colorIndex) => colorIndex !== index); return { ...previous, colors: colors.length ? colors : [''] }; })} className="px-3 rounded-xl bg-white border border-slate-100 text-slate-400 font-black">×</button></div>)}</div>
              <textarea className="input-field md:col-span-5 min-h-[90px] resize-y" placeholder="DESCRIPCIÓN" value={userProductForm.description || ''} onChange={(event) => setUserProductForm((previous) => ({ ...previous, description: event.target.value }))} />
              <textarea className="input-field md:col-span-5 min-h-[90px] resize-y" placeholder="ESPECIFICACIONES" value={userProductForm.specifications || ''} onChange={(event) => setUserProductForm((previous) => ({ ...previous, specifications: event.target.value }))} />
              <button disabled={userProductUploading} type="submit" className="md:col-span-5 btn-primary h-12 disabled:opacity-50 disabled:cursor-not-allowed">{userProductUploading ? 'Guardando...' : (editingUserProductId ? 'Guardar Cambios' : 'Agregar Producto')}</button>
            </form>
          </div>

          <div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-white border-b border-slate-50"><tr className="text-[8px] font-black uppercase text-slate-400"><th className="px-6 py-3">Foto</th><th className="px-6 py-3">Producto</th><th className="px-6 py-3">Precio</th><th className="px-6 py-3">Inventario</th><th className="px-6 py-3">Estado</th><th className="px-6 py-3 text-right">Acciones</th></tr></thead><tbody className="divide-y divide-slate-50">
            {currentUserProducts.map((product) => { const stock = Math.max(0, Math.floor(Number(product.stock ?? product.availableStock ?? 0))); const soldOut = stock <= 0; const statusLabel = soldOut ? 'Agotado' : (product.active !== false ? 'Activo' : 'Inactivo'); const statusClass = soldOut ? 'bg-red-50 text-red-600' : (product.active !== false ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-400'); const image = Core.getProductGallery(product)[0] || ''; return <tr key={product.id} className="text-[10px] font-bold text-slate-600"><td className="px-6 py-4"><div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden">{image && <img src={image} alt={product.name} className="w-full h-full object-cover" />}</div></td><td className="px-6 py-4"><p className="font-black text-slate-800">{product.name}</p><p className="font-mono text-[8px] text-slate-400">{product.id}</p></td><td className="px-6 py-4 text-red-600 font-black">${Number(product.price || 0).toFixed(2)}</td><td className="px-6 py-4">{stock}</td><td className="px-6 py-4"><span className={`px-2 py-1 rounded-full text-[8px] uppercase ${statusClass}`}>{statusLabel}</span></td><td className="px-6 py-4 text-right"><div className="flex justify-end gap-2 flex-wrap"><button type="button" onClick={() => editUserProduct(product)} className="px-2 py-1 bg-slate-100 rounded-lg text-[8px] font-black uppercase">Editar</button><button type="button" onClick={() => toggleUserProduct(product)} className="px-2 py-1 bg-slate-100 rounded-lg text-[8px] font-black uppercase">{product.active !== false ? 'Desactivar' : 'Activar'}</button><button type="button" onClick={() => deleteUserProduct(product)} className="text-slate-300 hover:text-red-500"><TrashIcon size={14} /></button></div></td></tr>; })}
            {currentUserProducts.length === 0 && <tr><td colSpan="6" className="px-6 py-8 text-center text-[10px] font-bold text-slate-300 uppercase">Aún no tienes publicaciones registradas</td></tr>}
          </tbody></table></div>
        </div>
      </>
    );
  }

  global.DriveMxUserProducts = {
    useUserProductsManager,
    UserProductsPanel,
    services: {
      getUserProfileId,
      getUserProfileEmail,
      getSaleRecordId,
      getSaleOwnerId,
      getSaleOwnerEmail,
      isSaleOwnedByUser,
      isProductOwnedByUserProfile,
      getSellerInfoForProduct,
      saveCompletedSaleMirror,
      deleteCompletedSaleMirror
    }
  };
})(window);

