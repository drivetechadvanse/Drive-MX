const PRODUCTS_PER_RAIL = 20;
const DEFAULT_AD_TITLE = 'Anúnciate aquí';
const DEFAULT_AD_PHONE = 'Comunícate al 5617549756';
const DEFAULT_AD_TEXT = `${DEFAULT_AD_TITLE}\n${DEFAULT_AD_PHONE}`;

function injectStyles() {
  const id = 'drive-mx-home-products-stylesheet';
  if (!globalThis.document || globalThis.document.getElementById(id)) return;
  const link = globalThis.document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = new URL('./home-products.css', import.meta.url).href;
  globalThis.document.head.appendChild(link);
}

function getReact() {
  return globalThis.React || null;
}

function h(type, props, ...children) {
  const React = getReact();
  if (!React) return null;
  return React.createElement(type, props, ...children);
}

function normalizeProducts(products = []) {
  return (Array.isArray(products) ? products : []).filter((product) => product && product.active !== false);
}

function chunkProducts(products = [], size = PRODUCTS_PER_RAIL) {
  const source = normalizeProducts(products);
  const chunks = [];
  for (let index = 0; index < source.length; index += size) {
    chunks.push(source.slice(index, index + size));
  }
  return chunks;
}

function getActiveAds(ads = []) {
  const manager = globalThis.DriveMxAdsManager;
  if (manager && typeof manager.getActiveAds === 'function') {
    return manager.getActiveAds(ads);
  }
  return (Array.isArray(ads) ? ads : []).filter((ad) => ad && ad.active !== false && Boolean(ad.imageUrl || ad.image));
}

function getAdForBlock(ads = [], blockIndex = 0) {
  const activeAds = getActiveAds(ads);
  if (activeAds.length === 0) return null;
  return activeAds[blockIndex % activeAds.length];
}

function getProductImage(product, getProductGallery) {
  const gallery = typeof getProductGallery === 'function' ? getProductGallery(product) : [];
  return gallery?.[0] || product?.imageUrl || product?.image || '';
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

function ProductCard({ product, onProductClick, getProductGallery }) {
  const image = getProductImage(product, getProductGallery);
  const stock = Math.max(0, Math.floor(Number(product?.stock ?? product?.availableStock ?? 0)));
  const isSoldOut = stock <= 0;
  return h('article', {
    key: product?.id,
    onClick: () => typeof onProductClick === 'function' && onProductClick(product),
    className: 'drive-mx-home-products-card bg-white rounded-[1.35rem] border border-slate-100 overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer',
    role: 'button',
    tabIndex: 0,
    onKeyDown: (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (typeof onProductClick === 'function') onProductClick(product);
      }
    }
  },
    h('div', { className: 'aspect-[4/3] bg-slate-100 overflow-hidden' },
      image
        ? h('img', { src: image, alt: product?.name || 'Producto', className: 'w-full h-full object-cover', loading: 'lazy' })
        : h('div', { className: 'w-full h-full flex items-center justify-center text-[10px] font-black text-slate-300 uppercase tracking-widest' }, 'Sin foto')
    ),
    h('div', { className: 'p-5 space-y-3' },
      h('div', null,
        h('h3', { className: 'drive-mx-home-products-card-title text-sm font-black text-slate-900 leading-tight' }, product?.name || 'Producto sin nombre')
      ),
      h('div', { className: 'flex items-center justify-between gap-3' },
        h('p', { className: 'text-xl font-black text-red-500' }, `$${Number(product?.price || 0).toFixed(2)}`),
        h('span', { className: `px-3 py-1 rounded-full text-[9px] font-black uppercase ${isSoldOut ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-500'}` }, isSoldOut ? 'Agotado' : `Stock: ${stock}`)
      )
    )
  );
}

function AdBanner({ ad, blockIndex = 0 }) {
  const imageUrl = ad?.imageUrl || ad?.image || '';
  return h('div', { className: 'drive-mx-home-products-ad', 'data-ad-block': String(blockIndex + 1) },
    imageUrl
      ? h('img', { src: imageUrl, alt: ad?.fileName || 'Anuncio publicitario Drive MX', className: 'drive-mx-home-products-ad-image', loading: 'lazy' })
      : h('div', { className: 'drive-mx-home-products-ad-fallback' },
          h('p', { className: 'drive-mx-home-products-ad-fallback-title' }, DEFAULT_AD_TITLE),
          h('p', { className: 'drive-mx-home-products-ad-fallback-phone' }, DEFAULT_AD_PHONE)
        )
  );
}

function ProductsRail({ products, blockIndex, totalBlocks, ads, getProductGallery, onProductClick }) {
  const React = getReact();
  if (!React) return null;
  const railRef = React.useRef(null);
  const pointerState = React.useRef({ active: false, pointerId: null, startX: 0, scrollLeft: 0, moved: false });

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
      scrollLeft: rail.scrollLeft,
      moved: false
    };
  };

  const onPointerMove = (event) => {
    const rail = railRef.current;
    const state = pointerState.current;
    if (!rail || !state.active || state.pointerId !== event.pointerId) return;
    const delta = event.clientX - state.startX;
    if (Math.abs(delta) > 6) state.moved = true;
    rail.scrollLeft = state.scrollLeft - delta;
  };

  const finishPointer = () => {
    pointerState.current = { active: false, pointerId: null, startX: 0, scrollLeft: 0, moved: false };
  };

  const ad = getAdForBlock(ads, blockIndex);
  const productStart = blockIndex * PRODUCTS_PER_RAIL + 1;
  const productEnd = productStart + products.length - 1;

  return h('section', { className: 'drive-mx-home-products-block space-y-4', 'data-products-block': String(blockIndex + 1) },
    h('div', { className: 'flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3' },
      h('div', null,
        h('p', { className: 'text-[9px] font-black text-slate-400 uppercase tracking-widest' }, `Carrusel ${blockIndex + 1}${totalBlocks > 1 ? ` de ${totalBlocks}` : ''}`),
        h('h3', { className: 'text-lg font-black tracking-tight text-slate-900' }, `Productos ${productStart}-${productEnd}`)
      ),
      h('div', { className: 'flex gap-2' },
        h('button', { type: 'button', className: 'drive-mx-home-products-arrow', 'aria-label': `Desplazar carrusel ${blockIndex + 1} a la izquierda`, onClick: () => scrollRail(-1) }, h(ChevronLeftIcon, null)),
        h('button', { type: 'button', className: 'drive-mx-home-products-arrow', 'aria-label': `Desplazar carrusel ${blockIndex + 1} a la derecha`, onClick: () => scrollRail(1) }, h(ChevronRightIcon, null))
      )
    ),
    h('div', { className: 'drive-mx-home-products-rail-shell' },
      h('div', {
        ref: railRef,
        className: 'drive-mx-home-products-rail',
        role: 'list',
        'aria-label': `Bloque de productos ${blockIndex + 1}`,
        onPointerDown,
        onPointerMove,
        onPointerUp: finishPointer,
        onPointerCancel: finishPointer,
        onPointerLeave: finishPointer
      },
        products.map((product, index) => h(ProductCard, {
          key: product?.id || `${blockIndex}_${index}`,
          product,
          onProductClick,
          getProductGallery
        }))
      )
    ),
    h(AdBanner, { ad, blockIndex })
  );
}

function EmptyProductsState({ ads }) {
  const ad = getAdForBlock(ads, 0);
  return h('div', { className: 'space-y-4' },
    h('div', { className: 'drive-mx-home-products-empty' },
      h('p', { className: 'text-[10px] font-black text-slate-400 uppercase tracking-widest' }, 'Aún no hay productos disponibles'),
      h('p', { className: 'text-[9px] font-bold text-slate-300 uppercase tracking-widest mt-1' }, 'El inventario se actualizará automáticamente cuando existan publicaciones activas')
    ),
    h(AdBanner, { ad, blockIndex: 0 })
  );
}

function HomeProductsSection(props = {}) {
  const React = getReact();
  if (!React) return null;
  const products = normalizeProducts(props.products || []);
  const blocks = chunkProducts(products, Number(props.productsPerRail || PRODUCTS_PER_RAIL));
  const ads = Array.isArray(props.ads) ? props.ads : [];

  return h('section', { className: 'drive-mx-home-products w-full space-y-7' },
    h('div', { className: 'flex items-end justify-between gap-4 mb-1' },
      h('div', null,
        h('p', { className: 'text-[10px] text-red-500 font-black uppercase tracking-widest' }, 'Inventario disponible'),
        h('h2', { className: 'text-2xl font-black tracking-tight' }, 'Productos ', h('span', { className: 'text-red-500' }, 'Drive MX'))
      ),
      h('p', { className: 'hidden sm:block text-[9px] font-bold text-slate-400 uppercase tracking-widest' }, 'Actualizado automáticamente')
    ),
    blocks.length > 0
      ? blocks.map((block, index) => h(ProductsRail, {
          key: `home_products_block_${index}`,
          products: block,
          blockIndex: index,
          totalBlocks: blocks.length,
          ads,
          getProductGallery: props.getProductGallery,
          onProductClick: props.onProductClick
        }))
      : h(EmptyProductsState, { ads })
  );
}

injectStyles();

globalThis.DriveMxHomeProducts = {
  PRODUCTS_PER_RAIL,
  DEFAULT_AD_TEXT,
  DEFAULT_AD_TITLE,
  DEFAULT_AD_PHONE,
  normalizeProducts,
  chunkProducts,
  getActiveAds,
  getAdForBlock,
  HomeProductsSection
};

