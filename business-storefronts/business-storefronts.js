(function (global) {
  'use strict';

  const BUSINESS_NAME_FIELD = 'businessName';
  const BUSINESS_NAME_MAX_LENGTH = 160;
  const PRODUCTS_PER_RAIL = 20;
  const ADMIN_OWNER_KEY = 'panel_control';
  const LOCAL_STORAGE_PREFIX = 'driveMxBusinessName';

  function injectStyles() {
    const id = 'drive-mx-business-storefronts-stylesheet';
    if (!global.document || global.document.getElementById(id)) return;
    const link = global.document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = './business-storefronts/business-storefronts.css';
    global.document.head.appendChild(link);
  }

  function getReact() {
    return global.React || null;
  }

  function h(type, props, ...children) {
    const React = getReact();
    return React ? React.createElement(type, props, ...children) : null;
  }

  function normalizeBusinessName(value = '') {
    return String(value || '').trim().replace(/\s+/g, ' ').slice(0, BUSINESS_NAME_MAX_LENGTH);
  }

  function normalizeOwnerValue(value = '') {
    return String(value || '').trim();
  }

  function normalizeEmail(value = '') {
    return String(value || '').trim().toLowerCase();
  }

  function safeStorageOwnerKey(ownerKey = '') {
    return String(ownerKey || ADMIN_OWNER_KEY).trim().replace(/[^a-zA-Z0-9@._-]/g, '_') || ADMIN_OWNER_KEY;
  }

  function getBusinessStorageKey(ownerKey = ADMIN_OWNER_KEY) {
    return `${LOCAL_STORAGE_PREFIX}_${safeStorageOwnerKey(ownerKey)}`;
  }

  function readStoredBusinessName(ownerKey = ADMIN_OWNER_KEY) {
    try {
      return normalizeBusinessName(global.localStorage?.getItem(getBusinessStorageKey(ownerKey)) || '');
    } catch (error) {
      return '';
    }
  }

  function rememberBusinessName(ownerKey = ADMIN_OWNER_KEY, businessName = '') {
    const normalized = normalizeBusinessName(businessName);
    if (!normalized) return '';
    try {
      global.localStorage?.setItem(getBusinessStorageKey(ownerKey), normalized);
    } catch (error) {}
    return normalized;
  }

  function getProductBusinessName(product = {}) {
    return normalizeBusinessName(
      product.businessName
      || product.nombreNegocio
      || product.business_name
      || product.storeName
      || product.store_name
      || ''
    );
  }

  function getProductOwnerId(product = {}) {
    const Core = global.DriveMxProductsCore || {};
    if (typeof Core.getProductOwnerId === 'function') return normalizeOwnerValue(Core.getProductOwnerId(product));
    return normalizeOwnerValue(product.ownerId || product.sellerId || product.userId || product.createdByUid || '');
  }

  function getProductPublicationType(product = {}) {
    const Core = global.DriveMxProductsCore || {};
    if (typeof Core.getProductPublicationType === 'function') return String(Core.getProductPublicationType(product) || '').trim().toLowerCase();
    return String(product.publicationType || product.productOrigin || product.sourcePanel || product.createdFromPanel || '').trim().toLowerCase();
  }

  function isUserPublication(product = {}) {
    const Core = global.DriveMxProductsCore || {};
    if (typeof Core.isUserPanelPublication === 'function') return Core.isUserPanelPublication(product);
    const type = getProductPublicationType(product);
    return Boolean(getProductOwnerId(product))
      || type === 'usuario'
      || type === 'user'
      || type === 'panel_usuario'
      || type === 'panel-usuario'
      || type === 'panel de usuario';
  }

  function getStorefrontOwnerKey(product = {}) {
    if (!isUserPublication(product)) return ADMIN_OWNER_KEY;
    const ownerId = getProductOwnerId(product);
    if (ownerId) return `usuario:${ownerId}`;
    const ownerEmail = normalizeEmail(product.ownerEmail || product.sellerEmail || product.createdBy || '');
    if (ownerEmail) return `usuario-email:${ownerEmail}`;
    return `usuario-producto:${normalizeOwnerValue(product.id || 'sin-id')}`;
  }

  function getProfileBusinessName(profile = {}) {
    return normalizeBusinessName(
      profile.businessName
      || profile.nombreNegocio
      || profile.business_name
      || profile.storeName
      || ''
    );
  }

  function getPreferredBusinessName(products = [], profile = {}, ownerKey = ADMIN_OWNER_KEY, fallback = '') {
    const profileName = getProfileBusinessName(profile);
    if (profileName) return profileName;
    const storedName = readStoredBusinessName(ownerKey);
    if (storedName) return storedName;
    const productName = (Array.isArray(products) ? products : [])
      .map(getProductBusinessName)
      .find(Boolean);
    return productName || normalizeBusinessName(fallback);
  }

  function applyBusinessName(product = {}, businessName = '') {
    const normalized = normalizeBusinessName(businessName);
    return { ...product, [BUSINESS_NAME_FIELD]: normalized };
  }

  function toMillis(value) {
    if (value && typeof value.toMillis === 'function') {
      const millis = Number(value.toMillis());
      return Number.isFinite(millis) && millis > 0 ? millis : 0;
    }
    if (value && typeof value.seconds === 'number') {
      const millis = Number(value.seconds) * 1000;
      return Number.isFinite(millis) && millis > 0 ? millis : 0;
    }
    const millis = Number(value || 0);
    return Number.isFinite(millis) && millis > 0 ? millis : 0;
  }

  function getProductCreatedAt(product = {}) {
    const explicit = toMillis(product.createdAt || product.publishedAt || product.publicationDate);
    if (explicit > 0) return explicit;
    const idMatch = String(product.id || '').match(/(\d{10,})$/);
    if (idMatch) {
      const fromId = Number(idMatch[1]);
      if (Number.isFinite(fromId) && fromId > 0) return fromId;
    }
    return toMillis(product.updatedAt);
  }

  function getProductUpdatedAt(product = {}) {
    return toMillis(product.updatedAt) || getProductCreatedAt(product);
  }

  function getBusinessNameUpdatedAt(product = {}) {
    return toMillis(product.businessNameUpdatedAt) || getProductUpdatedAt(product);
  }

  function sortStorefrontProducts(products = []) {
    const source = (Array.isArray(products) ? products : []).filter(Boolean);
    if (source.length <= 1) return [...source];
    let initialIndex = 0;
    let initialTime = Number.POSITIVE_INFINITY;
    source.forEach((product, index) => {
      const createdAt = getProductCreatedAt(product);
      const comparable = createdAt > 0 ? createdAt : Number.POSITIVE_INFINITY;
      if (comparable < initialTime) {
        initialTime = comparable;
        initialIndex = index;
      }
    });
    const initialProduct = source[initialIndex];
    const remaining = source
      .filter((_, index) => index !== initialIndex)
      .sort((a, b) => getProductUpdatedAt(b) - getProductUpdatedAt(a));
    return [initialProduct, ...remaining];
  }

  function getFallbackBusinessName(products = [], ownerKey = '') {
    const firstProduct = (Array.isArray(products) ? products : []).find(Boolean) || {};
    if (ownerKey === ADMIN_OWNER_KEY || !isUserPublication(firstProduct)) return 'Drive MX';
    const ownerName = normalizeBusinessName(firstProduct.ownerName || firstProduct.sellerName || '');
    if (ownerName) return ownerName;
    const ownerEmail = normalizeEmail(firstProduct.ownerEmail || firstProduct.sellerEmail || '');
    if (ownerEmail) return normalizeBusinessName(ownerEmail.split('@')[0]);
    return 'Negocio del usuario';
  }

  function getLatestExplicitBusinessName(products = [], selector = getProductBusinessName) {
    const namedProducts = (Array.isArray(products) ? products : [])
      .filter((product) => selector(product))
      .sort((a, b) => getBusinessNameUpdatedAt(b) - getBusinessNameUpdatedAt(a));
    return namedProducts.length > 0 ? normalizeBusinessName(selector(namedProducts[0])) : '';
  }

  function getProductSupermarketBusinessName(product = {}) {
    return normalizeBusinessName(
      product.supermarketBusinessName
      || product.nombreNegocioSupermercado
      || product.supermarket_business_name
      || getProductBusinessName(product)
    );
  }

  function getGroupBusinessName(products = [], ownerKey = '') {
    return getLatestExplicitBusinessName(products) || getFallbackBusinessName(products, ownerKey);
  }

  function getStorefrontBusinessName(products = [], ownerKey = '') {
    if (ownerKey === ADMIN_OWNER_KEY) {
      const generalProducts = filterProductsByCategory(products, 'general');
      return getLatestExplicitBusinessName(generalProducts) || 'Drive MX';
    }
    return getGroupBusinessName(products, ownerKey);
  }

  function getSupermarketSectionBusinessName(products = [], ownerKey = '') {
    if (ownerKey !== ADMIN_OWNER_KEY) return '';
    return getLatestExplicitBusinessName(products, getProductSupermarketBusinessName) || 'Supermercado';
  }

  function groupProductsByBusiness(products = []) {
    const groupsByKey = new Map();
    (Array.isArray(products) ? products : [])
      .filter((product) => product && product.active !== false)
      .forEach((product, productIndex) => {
        const ownerKey = getStorefrontOwnerKey(product);
        if (!groupsByKey.has(ownerKey)) groupsByKey.set(ownerKey, new Map());
        const productId = normalizeOwnerValue(product.id || '');
        const productKey = productId ? `id:${productId}` : `row:${productIndex}`;
        const groupMap = groupsByKey.get(ownerKey);
        const previous = groupMap.get(productKey);
        if (!previous || getProductUpdatedAt(product) >= getProductUpdatedAt(previous)) {
          groupMap.set(productKey, product);
        }
      });

    const groups = Array.from(groupsByKey.entries()).map(([ownerKey, groupMap]) => {
      const sortedProducts = sortStorefrontProducts(Array.from(groupMap.values()));
      const generalProducts = filterProductsByCategory(sortedProducts, 'general');
      const supermarketProducts = filterProductsByCategory(sortedProducts, 'supermercado');
      return {
        ownerKey,
        businessName: getStorefrontBusinessName(sortedProducts, ownerKey),
        supermarketBusinessName: getSupermarketSectionBusinessName(supermarketProducts, ownerKey),
        initialProduct: sortedProducts[0] || null,
        generalProducts,
        supermarketProducts,
        products: sortedProducts
      };
    });

    // El bloque oficial de Drive MX siempre encabeza la portada. Los bloques
    // de usuarios conservan entre sí el mismo orden en el que fueron recibidos.
    return [
      ...groups.filter((group) => group.ownerKey === ADMIN_OWNER_KEY),
      ...groups.filter((group) => group.ownerKey !== ADMIN_OWNER_KEY)
    ];
  }

  function isSupermarketProduct(product = {}) {
    const Supermercado = global.DriveMxSupermercado || global.DriveMxSupermercadoCore || {};
    if (typeof Supermercado.isSupermarketProduct === 'function') return Supermercado.isSupermarketProduct(product);
    const category = String(product.category || product.categoria || product.productCategory || product.product_category || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
    return category === 'supermercado';
  }

  function filterProductsByCategory(products = [], category = 'general') {
    const supermarket = category === 'supermercado';
    return (Array.isArray(products) ? products : []).filter((product) => {
      if (!product || product.active === false) return false;
      return supermarket ? isSupermarketProduct(product) : !isSupermarketProduct(product);
    });
  }

  function getRelatedProducts(products = [], selectedProduct = {}) {
    const selectedId = String(selectedProduct?.id || '');
    const ownerKey = getStorefrontOwnerKey(selectedProduct);
    return sortStorefrontProducts((Array.isArray(products) ? products : []).filter((product) => {
      if (!product || product.active === false) return false;
      if (String(product.id || '') === selectedId) return false;
      return getStorefrontOwnerKey(product) === ownerKey;
    }));
  }

  function chunkProducts(products = [], size = PRODUCTS_PER_RAIL) {
    const source = Array.isArray(products) ? products : [];
    const normalizedSize = Math.max(1, Math.floor(Number(size || PRODUCTS_PER_RAIL)));
    const chunks = [];
    for (let index = 0; index < source.length; index += normalizedSize) {
      chunks.push(source.slice(index, index + normalizedSize));
    }
    return chunks;
  }

  function ChevronLeftIcon() {
    return h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
      h('path', { d: 'm15 18-6-6 6-6' })
    );
  }

  function ChevronRightIcon() {
    return h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
      h('path', { d: 'm9 18 6-6-6-6' })
    );
  }

  function BusinessNameSettings(props = {}) {
    return h('div', { className: 'card-glass overflow-hidden drive-mx-business-name-settings' },
      h('div', { className: 'bg-slate-50 border-b border-slate-100 px-6 py-4' },
        h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400' }, 'Nombre del negocio'),
        h('p', { className: 'text-[9px] font-bold text-slate-300 uppercase mt-1' }, props.description || 'Este nombre identificará tu bloque de publicaciones en Productos Drive MX y Supermercado')
      ),
      h('form', { onSubmit: props.onSubmit, className: 'p-6 grid md:grid-cols-[1fr_auto] gap-3 items-end' },
        h('div', null,
          h('label', { className: 'block text-[9px] font-black uppercase text-slate-400 mb-2' }, 'Nombre del negocio'),
          h('input', {
            required: true,
            maxLength: BUSINESS_NAME_MAX_LENGTH,
            className: 'input-field',
            placeholder: 'NOMBRE DEL NEGOCIO',
            value: props.value || '',
            onChange: (event) => typeof props.onChange === 'function' && props.onChange(event.target.value)
          })
        ),
        h('button', {
          disabled: Boolean(props.saving),
          type: 'submit',
          className: 'btn-primary h-12 disabled:opacity-50 disabled:cursor-not-allowed'
        }, props.saving ? 'Guardando...' : 'Guardar nombre')
      )
    );
  }

  function FallbackProductCard({ product, onProductClick, getProductGallery, category = 'general' } = {}) {
    const gallery = typeof getProductGallery === 'function' ? getProductGallery(product) : [];
    const image = gallery?.[0] || product?.imageUrl || product?.image || '';
    const stock = Math.max(0, Math.floor(Number(product?.stock ?? product?.availableStock ?? 0)));
    const soldOut = stock <= 0;
    const supermarket = category === 'supermercado';
    const cardClass = supermarket ? 'drive-mx-supermercado-card' : 'drive-mx-home-products-card';
    const titleClass = supermarket ? 'drive-mx-supermercado-card-title' : 'drive-mx-home-products-card-title';
    const openProduct = () => typeof onProductClick === 'function' && onProductClick(product);
    return h('article', {
      className: `${cardClass} bg-white rounded-[1.35rem] border border-slate-100 overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer`,
      role: 'button',
      tabIndex: 0,
      onClick: openProduct,
      onKeyDown: (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openProduct();
        }
      }
    },
      h('div', { className: 'aspect-[4/3] bg-slate-100 overflow-hidden' },
        image
          ? h('img', { src: image, alt: product?.name || 'Producto', className: 'w-full h-full object-cover', loading: 'lazy' })
          : h('div', { className: 'w-full h-full flex items-center justify-center text-[10px] font-black text-slate-300 uppercase tracking-widest' }, 'Sin foto')
      ),
      h('div', { className: 'p-5 space-y-3' },
        supermarket ? h('p', { className: 'text-[8px] font-black uppercase tracking-widest text-red-500' }, 'Supermercado') : null,
        h('h3', { className: `${titleClass} text-sm font-black text-slate-900 leading-tight` }, product?.name || 'Producto sin nombre'),
        h('div', { className: 'flex items-center justify-between gap-3' },
          h('p', { className: 'text-xl font-black text-red-500' }, `$${Number(product?.price || 0).toFixed(2)}`),
          h('span', { className: `px-3 py-1 rounded-full text-[9px] font-black uppercase ${soldOut ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-500'}` }, soldOut ? 'Agotado' : `Stock: ${stock}`)
        )
      )
    );
  }

  function getProductCardComponent(category = 'general') {
    if (category === 'supermercado') {
      const Supermercado = global.DriveMxSupermercado || {};
      return Supermercado.SupermarketProductCard || FallbackProductCard;
    }
    const HomeProducts = global.DriveMxHomeProducts || {};
    return HomeProducts.ProductCard || FallbackProductCard;
  }

  function BusinessProductsRail(props = {}) {
    const React = getReact();
    if (!React) return null;
    const railRef = React.useRef(null);
    const pointerState = React.useRef({ active: false, pointerId: null, startX: 0, startY: 0, scrollLeft: 0, moved: false, axis: null });
    const category = props.category === 'supermercado' ? 'supermercado' : 'general';
    const products = Array.isArray(props.products) ? props.products : [];
    const railClass = category === 'supermercado' ? 'drive-mx-supermercado-rail' : 'drive-mx-home-products-rail';
    const shellClass = category === 'supermercado' ? 'drive-mx-supermercado-rail-shell' : 'drive-mx-home-products-rail-shell';
    const arrowClass = category === 'supermercado' ? 'drive-mx-supermercado-arrow' : 'drive-mx-home-products-arrow';
    const CardComponent = getProductCardComponent(category);
    const start = Math.max(1, Number(props.startIndex || 1));
    const end = start + products.length - 1;

    const scrollRail = (direction) => {
      const rail = railRef.current;
      if (!rail) return;
      const amount = Math.max(260, Math.min(rail.clientWidth * 0.9, 900));
      rail.scrollBy({ left: direction * amount, behavior: 'smooth' });
    };

    const onPointerDown = (event) => {
      const rail = railRef.current;
      if (!rail || event.pointerType === 'mouse') return;
      pointerState.current = {
        active: true,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: rail.scrollLeft,
        moved: false,
        axis: null
      };
    };

    const onPointerMove = (event) => {
      const rail = railRef.current;
      const state = pointerState.current;
      if (!rail || !state.active || state.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - state.startX;
      const deltaY = event.clientY - state.startY;
      if (!state.axis && Math.max(Math.abs(deltaX), Math.abs(deltaY)) > 6) {
        state.axis = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
      }
      if (state.axis !== 'horizontal') return;
      state.moved = true;
      rail.scrollLeft = state.scrollLeft - deltaX;
    };

    const finishPointer = () => {
      pointerState.current = { active: false, pointerId: null, startX: 0, startY: 0, scrollLeft: 0, moved: false, axis: null };
    };

    return h('div', { className: 'drive-mx-business-products-rail space-y-3' },
      h('div', { className: 'flex items-center justify-between gap-3' },
        h('p', { className: 'text-[9px] font-black text-slate-400 uppercase tracking-widest' }, products.length > 0 ? `Publicaciones ${start}-${end}` : 'Publicaciones'),
        h('div', { className: 'flex gap-2' },
          h('button', { type: 'button', className: arrowClass, 'aria-label': 'Desplazar publicaciones a la izquierda', onClick: () => scrollRail(-1) }, h(ChevronLeftIcon)),
          h('button', { type: 'button', className: arrowClass, 'aria-label': 'Desplazar publicaciones a la derecha', onClick: () => scrollRail(1) }, h(ChevronRightIcon))
        )
      ),
      h('div', { className: shellClass },
        h('div', {
          ref: railRef,
          className: railClass,
          role: 'list',
          'aria-label': props.ariaLabel || 'Publicaciones del negocio',
          onPointerDown,
          onPointerMove,
          onPointerUp: finishPointer,
          onPointerCancel: finishPointer,
          onPointerLeave: finishPointer
        },
          products.map((product, index) => h(CardComponent, {
            key: product?.id || `${category}_${start}_${index}`,
            product,
            category,
            getProductGallery: props.getProductGallery,
            onProductClick: props.onProductClick
          }))
        )
      )
    );
  }

  function renderAdBanner(ads = [], adBlockIndex = 0) {
    const HomeProducts = global.DriveMxHomeProducts || {};
    if (typeof HomeProducts.AdBanner === 'function') {
      const ad = typeof HomeProducts.getAdForBlock === 'function'
        ? HomeProducts.getAdForBlock(ads, adBlockIndex)
        : null;
      return h(HomeProducts.AdBanner, { ad, blockIndex: adBlockIndex });
    }
    return null;
  }

  function BusinessHomeSection(props = {}) {
    const React = getReact();
    if (!React) return null;
    const groups = groupProductsByBusiness(props.products || []);
    const railSize = Math.max(1, Math.floor(Number(props.productsPerRail || PRODUCTS_PER_RAIL)));
    let cumulativeGeneralProducts = 0;
    let adBlockIndex = 0;

    const storefronts = groups.map((group) => {
      const groupRows = [];

      if (group.generalProducts.length > 0) {
        const generalRows = [];
        let generalStart = 1;
        let generalIndex = 0;

        while (generalIndex < group.generalProducts.length) {
          const remainder = cumulativeGeneralProducts % PRODUCTS_PER_RAIL;
          const productsUntilAd = remainder === 0 ? PRODUCTS_PER_RAIL : PRODUCTS_PER_RAIL - remainder;
          const chunkSize = Math.max(1, Math.min(railSize, productsUntilAd, group.generalProducts.length - generalIndex));
          const chunk = group.generalProducts.slice(generalIndex, generalIndex + chunkSize);
          const currentStart = generalStart;
          generalIndex += chunk.length;
          generalStart += chunk.length;
          cumulativeGeneralProducts += chunk.length;

          generalRows.push(h(BusinessProductsRail, {
            key: `${group.ownerKey}_general_rail_${generalIndex}`,
            products: chunk,
            category: 'general',
            startIndex: currentStart,
            getProductGallery: props.getProductGallery,
            onProductClick: props.onProductClick,
            ariaLabel: `Productos Drive MX de ${group.businessName}`
          }));

          if (cumulativeGeneralProducts % PRODUCTS_PER_RAIL === 0) {
            generalRows.push(h(React.Fragment, { key: `${group.ownerKey}_general_ad_${adBlockIndex}` }, renderAdBanner(props.ads || [], adBlockIndex++)));
          }
        }

        groupRows.push(h('div', {
          key: `${group.ownerKey}_general`,
          className: 'drive-mx-business-related-category space-y-4',
          'data-business-category': 'productos-drive-mx'
        },
          h('h4', { className: 'text-sm font-black uppercase tracking-widest text-slate-700' }, 'Productos Drive MX'),
          ...generalRows
        ));
      }

      if (group.supermarketProducts.length > 0) {
        const supermarketRows = [];
        let supermarketStart = 1;
        for (let index = 0; index < group.supermarketProducts.length; index += railSize) {
          const chunk = group.supermarketProducts.slice(index, index + railSize);
          const currentStart = supermarketStart;
          supermarketStart += chunk.length;
          supermarketRows.push(h(BusinessProductsRail, {
            key: `${group.ownerKey}_supermercado_rail_${index}`,
            products: chunk,
            category: 'supermercado',
            startIndex: currentStart,
            getProductGallery: props.getProductGallery,
            onProductClick: props.onProductClick,
            ariaLabel: `Supermercado de ${group.businessName}`
          }));
        }

        const supermarketTitle = group.ownerKey === ADMIN_OWNER_KEY
          ? (group.supermarketBusinessName || 'Supermercado')
          : 'Supermercado';

        groupRows.push(h('div', {
          key: `${group.ownerKey}_supermercado`,
          className: 'drive-mx-business-related-category space-y-4',
          'data-business-category': 'supermercado'
        },
          h('div', null,
            h('p', { className: 'text-[9px] font-black text-red-500 uppercase tracking-widest' }, 'Supermercado'),
            h('h4', { className: 'text-sm font-black uppercase tracking-widest text-slate-700' }, supermarketTitle)
          ),
          ...supermarketRows
        ));
      }

      return h('section', {
        key: group.ownerKey,
        className: 'drive-mx-business-storefront space-y-5',
        'data-business-owner': group.ownerKey
      },
        h('div', { className: 'drive-mx-business-storefront-header flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3' },
          h('div', null,
            h('p', { className: 'text-[9px] font-black text-red-500 uppercase tracking-widest' }, 'Nombre del negocio'),
            h('h3', { className: 'drive-mx-business-storefront-name text-xl sm:text-2xl font-black tracking-tight text-slate-900' }, group.businessName)
          ),
          h('p', { className: 'text-[9px] font-black text-slate-400 uppercase tracking-widest' }, `${group.products.length} publicación${group.products.length === 1 ? '' : 'es'}`)
        ),
        ...groupRows
      );
    });

    if (groups.length > 0 && (cumulativeGeneralProducts === 0 || cumulativeGeneralProducts % PRODUCTS_PER_RAIL !== 0)) {
      const lastStorefront = storefronts[storefronts.length - 1];
      storefronts[storefronts.length - 1] = h(React.Fragment, { key: `last_storefront_${adBlockIndex}` },
        lastStorefront,
        renderAdBanner(props.ads || [], adBlockIndex)
      );
    }

    return h('section', {
      className: 'drive-mx-business-home drive-mx-business-home-general w-full space-y-7',
      id: 'supermercado-section'
    },
      h('div', { className: 'flex items-end justify-between gap-4 mb-1' },
        h('div', null,
          h('p', { className: 'text-[10px] text-red-500 font-black uppercase tracking-widest' }, 'Inventario disponible'),
          h('h2', { className: 'text-2xl font-black tracking-tight' }, 'Productos ', h('span', { className: 'text-red-500' }, 'Drive MX'))
        ),
        h('p', { className: 'hidden sm:block text-[9px] font-bold text-slate-400 uppercase tracking-widest' }, 'Actualizado automáticamente')
      ),
      groups.length > 0
        ? storefronts
        : h('div', { className: 'drive-mx-home-products-empty' },
            h('p', { className: 'text-[10px] font-black text-slate-400 uppercase tracking-widest' }, 'Aún no hay productos disponibles'),
            h('p', { className: 'text-[9px] font-bold text-slate-300 uppercase tracking-widest mt-1' }, 'El inventario se actualizará automáticamente cuando existan publicaciones activas')
          ),
      groups.length === 0 ? renderAdBanner(props.ads || [], 0) : null
    );
  }

  function RelatedCategorySection({ title, category, products, getProductGallery, onProductClick } = {}) {
    const chunks = chunkProducts(products, PRODUCTS_PER_RAIL);
    let start = 1;
    return h('section', { className: 'drive-mx-business-related-category space-y-4' },
      h('h3', { className: 'text-sm font-black uppercase tracking-widest text-slate-700' }, title),
      ...chunks.map((chunk, index) => {
        const currentStart = start;
        start += chunk.length;
        return h(BusinessProductsRail, {
          key: `${category}_related_${index}`,
          products: chunk,
          category,
          startIndex: currentStart,
          getProductGallery,
          onProductClick,
          ariaLabel: `${title} del mismo negocio`
        });
      })
    );
  }

  function RelatedBusinessProducts(props = {}) {
    const selectedProduct = props.selectedProduct || {};
    const relatedProducts = getRelatedProducts(props.products || [], selectedProduct);
    if (relatedProducts.length === 0) return null;
    const ownerKey = getStorefrontOwnerKey(selectedProduct);
    const allBusinessProducts = [selectedProduct, ...relatedProducts];
    const businessName = getStorefrontBusinessName(allBusinessProducts, ownerKey);
    const generalProducts = filterProductsByCategory(relatedProducts, 'general');
    const supermarketProducts = filterProductsByCategory(relatedProducts, 'supermercado');

    return h('div', { className: 'drive-mx-business-related w-full max-w-6xl pb-10 animate-slide' },
      h('div', { className: 'card-glass p-6 sm:p-8 space-y-7' },
        h('div', null,
          h('p', { className: 'text-[10px] text-red-500 font-black uppercase tracking-widest mb-1' }, 'Nombre del negocio'),
          h('h2', { className: 'text-2xl sm:text-3xl font-black tracking-tight text-slate-900' }, businessName),
          h('p', { className: 'text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-2' }, 'Más publicaciones de este negocio')
        ),
        generalProducts.length > 0 ? h(RelatedCategorySection, {
          title: 'Productos Drive MX',
          category: 'general',
          products: generalProducts,
          getProductGallery: props.getProductGallery,
          onProductClick: props.onProductClick
        }) : null,
        supermarketProducts.length > 0 ? h(RelatedCategorySection, {
          title: 'Supermercado',
          category: 'supermercado',
          products: supermarketProducts,
          getProductGallery: props.getProductGallery,
          onProductClick: props.onProductClick
        }) : null
      )
    );
  }

  injectStyles();

  global.DriveMxBusinessStorefronts = {
    BUSINESS_NAME_FIELD,
    BUSINESS_NAME_MAX_LENGTH,
    PRODUCTS_PER_RAIL,
    ADMIN_OWNER_KEY,
    normalizeBusinessName,
    getBusinessStorageKey,
    readStoredBusinessName,
    rememberBusinessName,
    getProductBusinessName,
    getStorefrontOwnerKey,
    getPreferredBusinessName,
    applyBusinessName,
    sortStorefrontProducts,
    groupProductsByBusiness,
    filterProductsByCategory,
    getRelatedProducts,
    BusinessNameSettings,
    BusinessProductsRail,
    BusinessHomeSection,
    RelatedBusinessProducts
  };
})(window);



