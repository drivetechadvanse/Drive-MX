(function (global) {
  'use strict';

  const React = global.React;
  if (!React) throw new Error('DriveMxAdminProducts: React no está disponible.');

  const { useState, useEffect, useMemo, useCallback } = React;
  const Core = global.DriveMxProductsCore;
  if (!Core) throw new Error('DriveMxAdminProducts: products-core no está disponible.');

  const EMPTY_FORM = {
    id: '',
    name: '',
    price: '',
    stock: '',
    description: '',
    specifications: '',
    sizes: [],
    colors: [''],
    images: [],
    image: '',
    imageUrl: '',
    active: true
  };

  const revokePreview = (item) => {
    if (!item?.preview) return;
    try { global.URL.revokeObjectURL(item.preview); } catch (error) {}
  };

  const createFormState = (overrides = {}, options = {}) => {
    const Supermercado = global.DriveMxSupermercado || global.DriveMxSupermercadoCore || {};
    const CostoEnvio = global.DriveMxCostoEnvio || {};
    const categoryForm = typeof Supermercado.createProductFormState === 'function'
      ? Supermercado.createProductFormState({ ...EMPTY_FORM, ...overrides }, overrides)
      : { ...EMPTY_FORM, ...overrides };
    if (typeof CostoEnvio.createProductFormState === 'function') {
      return CostoEnvio.createProductFormState(categoryForm, overrides, {
        defaultCost: options.defaultShippingCost
      });
    }
    return categoryForm;
  };

  function useAdminProductsManager({
    fbase,
    appId,
    fbUser,
    sessionUser,
    publicProducts,
    supermarketSettings = {},
    adminEmail = 'admin@drivemx.com'
  } = {}) {
    const [adminProducts, setAdminProducts] = useState(() => {
      const cached = Core.readLocal(Core.ADMIN_PRODUCTS_LOCAL_KEY, []);
      return Array.isArray(cached) ? Core.sortProducts(cached.map((item) => Core.ensureProductId(item)).filter((item) => item.id)) : [];
    });
    const configuredSupermarketShippingCost = Number(supermarketSettings?.shippingFee);
    const defaultSupermarketShippingCost = Number.isFinite(configuredSupermarketShippingCost) && configuredSupermarketShippingCost >= 0
      ? configuredSupermarketShippingCost
      : 150;
    const [productForm, setProductForm] = useState(() => createFormState({}, {
      defaultShippingCost: defaultSupermarketShippingCost
    }));
    const [productImageFiles, setProductImageFiles] = useState([]);
    const [productUploading, setProductUploading] = useState(false);
    const [editingProductId, setEditingProductId] = useState(null);

    const publicList = Array.isArray(publicProducts?.products) ? publicProducts.products : [];

    useEffect(() => {
      if (!fbUser || !fbase || !appId) return undefined;
      let unsubscribe = () => {};
      try {
        const db = fbase.getFirestore();
        const collectionRef = fbase.collection(db, 'artifacts', appId, 'public', 'data', Core.ADMIN_PRODUCTS_COLLECTION);
        unsubscribe = fbase.onSnapshot(collectionRef, (snapshot) => {
          const next = [];
          snapshot.forEach((documentSnapshot) => {
            const product = Core.ensureProductId(documentSnapshot.data() || {}, documentSnapshot.id);
            if (product.id) next.push(product);
          });
          const sorted = Core.sortProducts(next);
          setAdminProducts(sorted);
          Core.writeLocal(Core.ADMIN_PRODUCTS_LOCAL_KEY, sorted);
        }, (error) => {
          console.error('Firestore productos Panel de Control:', error);
        });
      } catch (error) {
        console.error('Inicializar productos Panel de Control:', error);
      }
      return () => unsubscribe?.();
    }, [fbUser, fbase, appId]);


    const replaceAdminProducts = useCallback((nextValue) => {
      setAdminProducts((previous) => {
        const resolved = typeof nextValue === 'function' ? nextValue(previous) : nextValue;
        const normalized = Core.sortProducts((Array.isArray(resolved) ? resolved : []).map((item) => Core.ensureProductId(item)).filter((item) => item.id));
        Core.writeLocal(Core.ADMIN_PRODUCTS_LOCAL_KEY, normalized);
        return normalized;
      });
    }, []);

    const upsertAdminLocal = useCallback((product = {}) => {
      const normalized = Core.ensureProductId(product);
      if (!normalized.id) return;
      replaceAdminProducts((previous) => [normalized, ...previous.filter((item) => String(item.id) !== String(normalized.id))]);
    }, [replaceAdminProducts]);

    const patchInventoryLocal = useCallback((productId, patch = {}) => {
      const id = String(productId || '').trim();
      if (!id) return;
      replaceAdminProducts((previous) => previous.map((product) => String(product.id) === id ? { ...product, ...patch, id } : product));
    }, [replaceAdminProducts]);

    const controlProducts = useMemo(() => {
      const byId = new Map();
      adminProducts.filter(Core.isControlPanelProduct).forEach((product) => byId.set(String(product.id), product));
      publicList.filter(Core.isControlPanelProduct).forEach((product) => byId.set(String(product.id), product));
      return Core.sortProducts(Array.from(byId.values()));
    }, [adminProducts, publicList]);

    const allProducts = useMemo(() => Core.sortProducts(publicList), [publicList]);

    const resetProductForm = useCallback(() => {
      setProductForm(createFormState({}, {
        defaultShippingCost: defaultSupermarketShippingCost
      }));
      setProductImageFiles((previous) => {
        previous.forEach(revokePreview);
        return [];
      });
      setProductUploading(false);
      setEditingProductId(null);
    }, [defaultSupermarketShippingCost]);

    const uploadSingleProductImage = useCallback(async (productId, file) => {
      if (!file || !String(file.type || '').startsWith('image/')) throw new Error('Selecciona un archivo de imagen válido.');
      const storage = fbase.getStorage();
      const safeName = String(file.name || 'imagen').replace(/[^a-zA-Z0-9._-]/g, '_');
      const imageRef = fbase.ref(storage, `products/${productId}/${Date.now()}-${safeName}`);
      await fbase.uploadBytes(imageRef, file);
      return await fbase.getDownloadURL(imageRef);
    }, [fbase]);

    const handleProductImagesSelect = useCallback((event) => {
      const input = event?.target;
      const files = Array.from(input?.files || []).filter((file) => String(file.type || '').startsWith('image/'));
      if (files.length === 0) {
        if (input) input.value = '';
        return;
      }
      const currentCount = (productForm.images || []).length + productImageFiles.length;
      const availableSlots = Math.max(0, 5 - currentCount);
      if (availableSlots === 0) {
        alert('Solo puedes guardar hasta 5 fotografías por producto.');
        if (input) input.value = '';
        return;
      }
      const selected = files.slice(0, availableSlots).map((file) => ({ file, preview: global.URL.createObjectURL(file) }));
      if (files.length > availableSlots) alert('Solo se agregaron las fotografías permitidas hasta completar 5.');
      setProductImageFiles((previous) => [...previous, ...selected]);
      if (input) input.value = '';
    }, [productForm.images, productImageFiles.length]);

    const removeExistingProductImage = useCallback((index) => {
      setProductForm((previous) => ({ ...previous, images: (previous.images || []).filter((_, imageIndex) => imageIndex !== index) }));
    }, []);

    const removeNewProductImage = useCallback((index) => {
      setProductImageFiles((previous) => {
        revokePreview(previous[index]);
        return previous.filter((_, imageIndex) => imageIndex !== index);
      });
    }, []);

    const replaceExistingProductImage = useCallback(async (index, event) => {
      const input = event?.target;
      const file = input?.files?.[0];
      if (input) input.value = '';
      if (!file) return;
      if (!String(file.type || '').startsWith('image/')) {
        alert('Selecciona un archivo de imagen válido.');
        return;
      }
      const id = editingProductId || productForm.id;
      const existing = controlProducts.find((product) => String(product.id) === String(id));
      if (!id || (editingProductId && !existing)) {
        alert('Guarda primero el producto del Panel de Control para poder reemplazar fotografías existentes.');
        return;
      }
      setProductUploading(true);
      try {
        const url = await uploadSingleProductImage(id, file);
        setProductForm((previous) => {
          const images = [...(previous.images || [])];
          images[index] = url;
          return { ...previous, images, image: images[0] || '', imageUrl: images[0] || '' };
        });
      } catch (error) {
        console.error('Storage reemplazar foto Panel de Control:', error);
        alert(error?.message || 'No se pudo reemplazar la fotografía.');
      } finally {
        setProductUploading(false);
      }
    }, [editingProductId, productForm.id, controlProducts, uploadSingleProductImage]);

    const saveAdminMirror = useCallback(async (product = {}, options = {}) => {
      const normalized = Core.ensureProductId(product);
      if (!normalized.id) throw new Error('El producto no tiene un ID válido.');
      const { throwOnError = false } = options || {};
      upsertAdminLocal(normalized);
      try {
        const db = fbase.getFirestore();
        const productRef = fbase.doc(db, 'artifacts', appId, 'public', 'data', Core.ADMIN_PRODUCTS_COLLECTION, normalized.id);
        await fbase.setDoc(productRef, normalized);
        return normalized;
      } catch (error) {
        console.error('Guardar espejo de producto del Panel de Control:', error);
        if (throwOnError) throw error;
        return normalized;
      }
    }, [fbase, appId, upsertAdminLocal]);

    const uploadPendingProductImages = useCallback(async (productId) => {
      const urls = [];
      for (const item of productImageFiles) urls.push(await uploadSingleProductImage(productId, item.file));
      return urls;
    }, [productImageFiles, uploadSingleProductImage]);

    const handleProductSubmit = useCallback(async (event) => {
      event?.preventDefault?.();
      if (sessionUser?.role !== 'admin') {
        alert('Solo el administrador puede modificar productos del Panel de Control.');
        return;
      }
      const id = editingProductId || productForm.id || `prod_${Date.now()}`;
      const name = String(productForm.name || '').trim();
      if (!name) {
        alert('Ingresa el nombre del producto.');
        return;
      }
      const CostoEnvio = global.DriveMxCostoEnvio || {};
      if (typeof CostoEnvio.validateProductShipping === 'function') {
        const shippingValidation = CostoEnvio.validateProductShipping(productForm, {
          defaultCost: defaultSupermarketShippingCost,
          requireAccepted: true
        });
        if (!shippingValidation.ok) {
          alert(shippingValidation.message);
          return;
        }
      }
      setProductUploading(true);
      try {
        const Supermercado = global.DriveMxSupermercado || global.DriveMxSupermercadoCore || {};
        const existing = controlProducts.find((product) => String(product.id) === String(id));
        const oldImages = Core.getProductGallery(existing);
        const currentImages = Array.isArray(productForm.images) ? productForm.images.filter(Boolean) : oldImages;
        const uploadedImages = await uploadPendingProductImages(id);
        const images = [...currentImages, ...uploadedImages].filter(Boolean).slice(0, 5);
        const mainImage = images[0] || '';
        const baseProduct = {
          ...(existing || {}),
          id,
          name,
          price: Number(productForm.price || 0),
          stock: Math.max(0, Math.floor(Number(productForm.stock || 0))),
          description: String(productForm.description || '').trim(),
          specifications: String(productForm.specifications || '').trim(),
          sizes: Core.normalizeProductSizes(productForm.sizes),
          colors: Core.normalizeProductColors(productForm.colors),
          images,
          image: mainImage,
          imageUrl: mainImage,
          active: Boolean(productForm.active),
          publicationType: Core.PRODUCT_ORIGIN_CONTROL,
          sourcePanel: Core.PRODUCT_ORIGIN_CONTROL,
          ownerId: '',
          ownerName: '',
          ownerEmail: '',
          ownerPhone: '',
          saleNotificationEmail: '',
          sellerNotificationEmail: '',
          updatedAt: Date.now(),
          updatedBy: sessionUser?.email || adminEmail,
          createdAt: existing?.createdAt || Date.now(),
          createdBy: existing?.createdBy || sessionUser?.email || adminEmail
        };
        const categorizedProduct = typeof Supermercado.applyCategoryToProduct === 'function'
          ? Supermercado.applyCategoryToProduct(baseProduct, productForm)
          : baseProduct;
        const product = typeof CostoEnvio.applyShippingToProduct === 'function'
          ? CostoEnvio.applyShippingToProduct(categorizedProduct, productForm, {
              defaultCost: defaultSupermarketShippingCost,
              requireAccepted: true
            })
          : categorizedProduct;
        // El documento público es la fuente principal. El espejo del panel se
        // conserva como respaldo, pero un fallo aislado del espejo no duplica
        // publicaciones ni deja el formulario reportando un falso error.
        await publicProducts.savePublicProduct(product, { applyLocalOnError: false });
        await saveAdminMirror(product);
        resetProductForm();
      } catch (error) {
        console.error('Guardar producto Panel de Control:', error);
        alert('No se pudo guardar el producto. Intenta nuevamente.');
        setProductUploading(false);
      }
    }, [sessionUser, editingProductId, productForm, controlProducts, uploadPendingProductImages, adminEmail, saveAdminMirror, publicProducts, resetProductForm, defaultSupermarketShippingCost]);

    const editProduct = useCallback((product) => {
      if (!Core.isControlPanelProduct(product)) {
        alert('Solo puedes editar publicaciones del Panel de Control.');
        return;
      }
      const images = Core.getProductGallery(product);
      const colors = Core.normalizeProductColors(product.colors || product.colores);
      const CostoEnvio = global.DriveMxCostoEnvio || {};
      const shippingFields = typeof CostoEnvio.copyProductShipping === 'function'
        ? CostoEnvio.copyProductShipping({}, product)
        : {};
      setProductForm(createFormState({
        id: product.id,
        name: product.name || '',
        price: product.price ?? '',
        stock: product.stock ?? '',
        description: product.description || '',
        specifications: product.specifications || '',
        sizes: Core.normalizeProductSizes(product.sizes || product.medidas),
        colors: colors.length ? colors : [''],
        images,
        image: images[0] || '',
        imageUrl: images[0] || '',
        active: product.active !== false,
        category: product.category || product.productCategory || product.categoria || product.product_category || '',
        ...shippingFields
      }, {
        defaultShippingCost: defaultSupermarketShippingCost
      }));
      setProductImageFiles((previous) => {
        previous.forEach(revokePreview);
        return [];
      });
      setEditingProductId(product.id);
    }, [defaultSupermarketShippingCost]);

    const toggleProduct = useCallback(async (product) => {
      if (!Core.isControlPanelProduct(product)) {
        alert('Solo puedes administrar publicaciones del Panel de Control.');
        return;
      }
      const next = {
        ...product,
        active: product.active === false,
        publicationType: Core.PRODUCT_ORIGIN_CONTROL,
        sourcePanel: Core.PRODUCT_ORIGIN_CONTROL,
        updatedAt: Date.now(),
        updatedBy: sessionUser?.email || adminEmail
      };
      try {
        await publicProducts.savePublicProduct(next, { applyLocalOnError: false });
        await saveAdminMirror(next);
      } catch (error) {
        alert('No se pudo actualizar el estado del producto.');
      }
    }, [sessionUser, adminEmail, saveAdminMirror, publicProducts]);

    const deleteProduct = useCallback(async (productOrId) => {
      const id = String(productOrId?.id || productOrId || '').trim();
      if (!id) return;
      const previousAdmin = adminProducts.find((product) => String(product.id) === id) || null;
      const previousPublic = publicList.find((product) => String(product.id) === id) || null;
      replaceAdminProducts((previous) => previous.filter((product) => String(product.id) !== id));
      publicProducts.removeLocal(id);
      let adminMirrorDeleted = false;
      try {
        const db = fbase.getFirestore();
        const adminRef = fbase.doc(db, 'artifacts', appId, 'public', 'data', Core.ADMIN_PRODUCTS_COLLECTION, id);
        const publicRef = fbase.doc(db, 'artifacts', appId, 'public', 'data', Core.PUBLIC_PRODUCTS_COLLECTION, id);
        // Se elimina primero el espejo. Si el documento público falla, el
        // espejo se restaura para evitar que las dos colecciones queden partidas.
        await fbase.deleteDoc(adminRef);
        adminMirrorDeleted = true;
        await fbase.deleteDoc(publicRef);
        if (String(editingProductId) === id) resetProductForm();
      } catch (error) {
        console.error('Firestore borrar producto Panel de Control:', error);
        const productToRestore = previousAdmin || previousPublic;
        if (adminMirrorDeleted && productToRestore) {
          try {
            const db = fbase.getFirestore();
            const adminRef = fbase.doc(db, 'artifacts', appId, 'public', 'data', Core.ADMIN_PRODUCTS_COLLECTION, id);
            await fbase.setDoc(adminRef, productToRestore);
          } catch (restoreError) {
            console.error('Restaurar espejo del producto del Panel de Control:', restoreError);
          }
        }
        if (productToRestore) upsertAdminLocal(productToRestore);
        if (previousPublic) publicProducts.upsertLocal(previousPublic);
        alert('No se pudo eliminar el producto.');
      }
    }, [adminProducts, publicList, replaceAdminProducts, publicProducts, fbase, appId, editingProductId, resetProductForm, upsertAdminLocal]);

    const saveProductShippingConfiguration = useCallback(async (product = {}, shippingSource = {}) => {
      if (sessionUser?.role !== 'admin') throw new Error('Solo el administrador puede configurar el costo de envío.');
      const normalized = Core.ensureProductId(product);
      if (!normalized.id) throw new Error('El producto no tiene un ID válido.');

      const Supermercado = global.DriveMxSupermercado || global.DriveMxSupermercadoCore || {};
      if (typeof Supermercado.isSupermarketProduct === 'function' && !Supermercado.isSupermarketProduct(normalized)) {
        throw new Error('La configuración de costo de envío solo aplica a productos de Supermercado.');
      }

      const CostoEnvio = global.DriveMxCostoEnvio || {};
      if (typeof CostoEnvio.applyShippingToProduct !== 'function') {
        throw new Error('No se encontró el módulo Costo de envío.');
      }
      if (!fbase || typeof fbase.runTransaction !== 'function') {
        throw new Error('Firebase runTransaction no está disponible para guardar el costo de envío de forma segura.');
      }

      const updatedAt = Date.now();
      const updatedProduct = CostoEnvio.applyShippingToProduct({
        ...normalized,
        updatedAt,
        updatedBy: sessionUser?.email || adminEmail
      }, {
        ...normalized,
        ...shippingSource,
        category: normalized.category || normalized.productCategory || normalized.categoria || ''
      }, {
        defaultCost: defaultSupermarketShippingCost,
        requireAccepted: true
      });

      const shippingModeField = CostoEnvio.SHIPPING_MODE_FIELD || 'supermarketShippingMode';
      const shippingCostField = CostoEnvio.SHIPPING_COST_FIELD || 'supermarketShippingCost';
      const shippingPatch = {
        [shippingModeField]: updatedProduct[shippingModeField],
        [shippingCostField]: updatedProduct[shippingCostField],
        updatedAt,
        updatedBy: updatedProduct.updatedBy
      };

      const db = fbase.getFirestore();
      const publicProductRef = fbase.doc(
        db,
        'artifacts', appId, 'public', 'data',
        Core.PUBLIC_PRODUCTS_COLLECTION, normalized.id
      );

      const isUserPublication = Core.isUserPanelPublication(updatedProduct);
      let mirrorProductRef;
      if (isUserPublication) {
        const ownerDocId = Core.safeDocumentId(Core.getProductOwnerId(updatedProduct));
        if (!ownerDocId) {
          throw new Error('No se encontró el usuario propietario del producto.');
        }
        mirrorProductRef = fbase.doc(
          db,
          'artifacts', appId, 'public', 'data',
          Core.USER_PRODUCTS_COLLECTION, ownerDocId, 'items', updatedProduct.id
        );
      } else {
        mirrorProductRef = fbase.doc(
          db,
          'artifacts', appId, 'public', 'data',
          Core.ADMIN_PRODUCTS_COLLECTION, updatedProduct.id
        );
      }

      await fbase.runTransaction(db, async (transaction) => {
        // Todas las lecturas se realizan antes de escribir para conservar de
        // forma atómica el documento público y su espejo correspondiente.
        const publicSnapshot = await transaction.get(publicProductRef);
        const mirrorSnapshot = await transaction.get(mirrorProductRef);
        const publicBase = publicSnapshot.exists()
          ? Core.ensureProductId(publicSnapshot.data() || {}, normalized.id)
          : normalized;
        const completeProduct = {
          ...publicBase,
          ...shippingPatch,
          id: normalized.id
        };

        if (publicSnapshot.exists()) {
          transaction.set(publicProductRef, shippingPatch, { merge: true });
        } else {
          transaction.set(publicProductRef, completeProduct);
        }

        if (mirrorSnapshot.exists()) {
          transaction.set(mirrorProductRef, shippingPatch, { merge: true });
        } else {
          transaction.set(mirrorProductRef, completeProduct);
        }
      });

      publicProducts.patchLocal(normalized.id, shippingPatch);
      if (!isUserPublication) patchInventoryLocal(normalized.id, shippingPatch);
      return { ...normalized, ...shippingPatch };
    }, [sessionUser, adminEmail, defaultSupermarketShippingCost, publicProducts, patchInventoryLocal, fbase, appId]);

    return {
      adminProducts,
      controlProducts,
      allProducts,
      publicProducts: publicList,
      supermarketSettings,
      productForm,
      setProductForm,
      productImageFiles,
      productUploading,
      editingProductId,
      resetProductForm,
      handleProductImagesSelect,
      removeExistingProductImage,
      removeNewProductImage,
      replaceExistingProductImage,
      handleProductSubmit,
      editProduct,
      toggleProduct,
      deleteProduct,
      patchInventoryLocal,
      upsertAdminLocal,
      saveAdminMirror,
      saveProductShippingConfiguration
    };
  }

  function AdminProductsPanel({ manager, Icons = {} } = {}) {
    if (!manager) return null;
    const TrashIcon = Icons.Trash || (() => null);
    const Supermercado = global.DriveMxSupermercado || global.DriveMxSupermercadoCore || {};
    const CostoEnvio = global.DriveMxCostoEnvio || {};
    const {
      productForm,
      setProductForm,
      productImageFiles,
      productUploading,
      editingProductId,
      controlProducts,
      resetProductForm,
      handleProductImagesSelect,
      removeExistingProductImage,
      removeNewProductImage,
      replaceExistingProductImage,
      handleProductSubmit,
      editProduct,
      toggleProduct,
      deleteProduct
    } = manager;

    return (
      <div className="card-glass overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 drive-mx-panel-section-title">Administración de Productos</h2>
            <p className="text-[9px] font-bold text-slate-300 uppercase mt-1">Administra únicamente publicaciones creadas desde el Panel de Control</p>
          </div>
          {editingProductId && <button type="button" onClick={resetProductForm} className="text-[9px] font-black text-slate-400 uppercase">Cancelar edición</button>}
        </div>

        <div className="p-6 border-b border-slate-50">
          <form onSubmit={handleProductSubmit} className="grid md:grid-cols-5 gap-3">
            <label className="md:col-span-5 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-4 cursor-pointer hover:border-red-200 transition-all">
              <input type="file" accept="image/*" multiple className="hidden" onChange={handleProductImagesSelect} />
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-600">Fotografías del producto</p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Máximo 5 imágenes JPG, PNG o WebP asociadas al mismo ID</p>
                </div>
                <span className="px-3 py-2 bg-white rounded-xl text-[9px] font-black text-slate-400 uppercase">{(productForm.images || []).length + productImageFiles.length}/5 fotos</span>
              </div>
            </label>

            {((productForm.images || []).length > 0 || productImageFiles.length > 0) && (
              <div className="md:col-span-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {(productForm.images || []).map((image, index) => (
                  <div key={`${image}-${index}`} className="relative rounded-2xl overflow-hidden bg-slate-100 border border-slate-100 group">
                    <img src={image} alt={`Foto ${index + 1}`} className="w-full aspect-square object-cover" />
                    <div className="absolute inset-x-2 bottom-2 flex gap-1">
                      <label className="flex-1 text-center bg-white/90 rounded-lg px-2 py-1 text-[7px] font-black uppercase cursor-pointer">
                        Reemplazar
                        <input type="file" accept="image/*" className="hidden" onChange={(event) => replaceExistingProductImage(index, event)} />
                      </label>
                      <button type="button" onClick={() => removeExistingProductImage(index)} className="flex-1 bg-red-500 text-white rounded-lg px-2 py-1 text-[7px] font-black uppercase">Eliminar</button>
                    </div>
                  </div>
                ))}
                {productImageFiles.map((item, index) => (
                  <div key={item.preview} className="relative rounded-2xl overflow-hidden bg-slate-100 border border-dashed border-red-200">
                    <img src={item.preview} alt={`Nueva foto ${index + 1}`} className="w-full aspect-square object-cover" />
                    <button type="button" onClick={() => removeNewProductImage(index)} className="absolute inset-x-2 bottom-2 bg-red-500 text-white rounded-lg px-2 py-1 text-[7px] font-black uppercase">Quitar</button>
                  </div>
                ))}
              </div>
            )}

            {Supermercado.ProductCategorySelect && (
              <Supermercado.ProductCategorySelect
                value={productForm.category || ''}
                onChange={(category) => setProductForm((previous) => ({ ...previous, category }))}
              />
            )}

            {CostoEnvio.ProductShippingCostFields && (
              <CostoEnvio.ProductShippingCostFields
                productForm={productForm}
                setProductForm={setProductForm}
                defaultCost={manager.supermarketSettings?.shippingFee ?? 150}
              />
            )}

            <input required className="input-field md:col-span-2" placeholder="NOMBRE" value={productForm.name || ''} onChange={(event) => setProductForm((previous) => ({ ...previous, name: event.target.value }))} />
            <input required type="number" min="0" step="0.01" className="input-field" placeholder="PRECIO" value={productForm.price ?? ''} onChange={(event) => setProductForm((previous) => ({ ...previous, price: event.target.value }))} />
            <input required type="number" min="0" step="1" className="input-field" placeholder="INVENTARIO" value={productForm.stock ?? ''} onChange={(event) => setProductForm((previous) => ({ ...previous, stock: event.target.value }))} />
            <label className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-500 bg-slate-50 rounded-xl px-4 py-3">
              <input type="checkbox" checked={Boolean(productForm.active)} onChange={(event) => setProductForm((previous) => ({ ...previous, active: event.target.checked }))} />
              Activo
            </label>

            <div className="md:col-span-5 bg-slate-50 rounded-2xl p-4 space-y-3">
              <p className="text-[10px] font-black uppercase text-slate-600">Medidas opcionales</p>
              <div className="flex flex-wrap gap-2">
                {Core.PRODUCT_SIZE_OPTIONS.map((size) => {
                  const selected = Core.normalizeProductSizes(productForm.sizes).includes(size);
                  return (
                    <label key={size} className={`px-3 py-2 rounded-xl border text-[9px] font-black uppercase cursor-pointer ${selected ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white border-slate-100 text-slate-400'}`}>
                      <input type="checkbox" className="hidden" checked={selected} onChange={(event) => setProductForm((previous) => ({ ...previous, sizes: event.target.checked ? [...Core.normalizeProductSizes(previous.sizes), size] : Core.normalizeProductSizes(previous.sizes).filter((item) => item !== size) }))} />
                      {size}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="md:col-span-5 bg-slate-50 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase text-slate-600">Colores opcionales</p>
                <button type="button" onClick={() => setProductForm((previous) => ({ ...previous, colors: [...(previous.colors || ['']), ''] }))} className="px-3 py-2 bg-white border border-slate-100 rounded-xl text-[10px] font-black text-red-500">+</button>
              </div>
              {(productForm.colors || ['']).map((color, index) => (
                <div key={index} className="flex gap-2">
                  <input className="input-field" placeholder="COLOR" value={color || ''} onChange={(event) => setProductForm((previous) => { const colors = [...(previous.colors || [''])]; colors[index] = event.target.value; return { ...previous, colors }; })} />
                  <button type="button" onClick={() => setProductForm((previous) => { const colors = (previous.colors || ['']).filter((_, colorIndex) => colorIndex !== index); return { ...previous, colors: colors.length ? colors : [''] }; })} className="px-3 rounded-xl bg-white border border-slate-100 text-slate-400 font-black">×</button>
                </div>
              ))}
            </div>

            <textarea className="input-field md:col-span-5 min-h-[90px] resize-y" placeholder="DESCRIPCIÓN" value={productForm.description || ''} onChange={(event) => setProductForm((previous) => ({ ...previous, description: event.target.value }))} />
            <textarea className="input-field md:col-span-5 min-h-[90px] resize-y" placeholder="ESPECIFICACIONES" value={productForm.specifications || ''} onChange={(event) => setProductForm((previous) => ({ ...previous, specifications: event.target.value }))} />
            <button disabled={productUploading} type="submit" className="md:col-span-5 btn-primary h-12 disabled:opacity-50 disabled:cursor-not-allowed">{productUploading ? 'Guardando...' : (editingProductId ? 'Guardar Cambios' : 'Agregar Producto')}</button>
          </form>
        </div>

        <div className="overflow-x-auto drive-mx-panel-table-wrap">
          <table className="w-full text-left">
            <thead className="bg-white border-b border-slate-50">
              <tr className="text-[8px] font-black uppercase text-slate-400">
                <th className="px-6 py-3">Foto</th><th className="px-6 py-3">Producto</th><th className="px-6 py-3">Precio</th><th className="px-6 py-3">Inventario</th><th className="px-6 py-3">Estado</th><th className="px-6 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {controlProducts.map((product) => {
                const stock = Math.max(0, Math.floor(Number(product.stock ?? product.availableStock ?? 0)));
                const soldOut = stock <= 0;
                const statusLabel = soldOut ? 'Agotado' : (product.active !== false ? 'Activo' : 'Inactivo');
                const statusClass = soldOut ? 'bg-red-50 text-red-600' : (product.active !== false ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-400');
                const image = Core.getProductGallery(product)[0] || '';
                return (
                  <tr key={product.id} className="text-[10px] font-bold text-slate-600">
                    <td className="px-6 py-4"><div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden drive-mx-panel-product-thumb">{image && <img src={image} alt={product.name} className="w-full h-full object-cover" />}</div></td>
                    <td className="px-6 py-4"><p className="font-black text-slate-800">{product.name}</p><p className="font-mono text-[8px] text-slate-400">{product.id}</p></td>
                    <td className="px-6 py-4 text-red-600 font-black">${Number(product.price || 0).toFixed(2)}</td>
                    <td className="px-6 py-4">{stock}</td>
                    <td className="px-6 py-4"><span className={`px-2 py-1 rounded-full text-[8px] uppercase ${statusClass}`}>{statusLabel}</span></td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 flex-wrap">
                        <button type="button" onClick={() => editProduct(product)} className="px-2 py-1 bg-slate-100 rounded-lg text-[8px] font-black uppercase">Editar</button>
                        <button type="button" onClick={() => toggleProduct(product)} className="px-2 py-1 bg-slate-100 rounded-lg text-[8px] font-black uppercase">{product.active !== false ? 'Desactivar' : 'Activar'}</button>
                        <button type="button" onClick={() => deleteProduct(product)} className="text-slate-300 hover:text-red-500"><TrashIcon size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {controlProducts.length === 0 && <tr><td colSpan="6" className="px-6 py-8 text-center text-[10px] font-bold text-slate-300 uppercase">Aún no hay productos registrados</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  global.DriveMxAdminProducts = {
    useAdminProductsManager,
    AdminProductsPanel
  };
})(window);

