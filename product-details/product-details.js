function injectStyles() {
  const id = 'drive-mx-product-details-stylesheet';
  if (!globalThis.document || globalThis.document.getElementById(id)) return;
  const link = globalThis.document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = new URL('./product-details.css', import.meta.url).href;
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

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function formatMoney(value) {
  return `$${roundMoney(value).toFixed(2)}`;
}

function normalizeStock(value) {
  const stock = Math.floor(Number(value || 0));
  return Number.isFinite(stock) && stock > 0 ? stock : 0;
}

function getProductStock(product = {}) {
  return normalizeStock(product.stock ?? product.availableStock ?? product.inventory ?? 0);
}

function normalizeQuantity(value, fallback = 1) {
  const quantity = Math.floor(Number(value ?? fallback));
  return Number.isFinite(quantity) && quantity > 0 ? quantity : Math.max(1, Math.floor(Number(fallback || 1)) || 1);
}

function clampQuantity(value, product = {}) {
  const stock = getProductStock(product);
  if (stock <= 0) return 0;
  return Math.min(normalizeQuantity(value, 1), stock);
}

function getProductUnitPrice(product = {}) {
  const value = Number(product.unitPrice ?? product.productUnitPrice ?? product.price ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getProductLineTotal(product = {}, quantity = product.quantity ?? product.productQuantity ?? 1) {
  const explicit = product.lineTotal ?? product.totalPrice ?? product.productTotal;
  if (explicit !== undefined && explicit !== null && explicit !== '') {
    const total = Number(explicit);
    if (Number.isFinite(total) && total >= 0) return roundMoney(total);
  }
  return roundMoney(getProductUnitPrice(product) * normalizeQuantity(quantity, 1));
}

function createPurchaseSummary(product = {}, quantity = 1) {
  const selectedQuantity = clampQuantity(quantity, product);
  const unitPrice = getProductUnitPrice(product);
  const lineTotal = selectedQuantity > 0 ? roundMoney(unitPrice * selectedQuantity) : 0;
  return {
    stock: getProductStock(product),
    quantity: selectedQuantity,
    unitPrice,
    lineTotal,
    total: lineTotal,
    inStock: selectedQuantity > 0
  };
}

function getGallery(product = {}, fallbackGallery = []) {
  const gallery = Array.isArray(fallbackGallery) ? fallbackGallery.filter(Boolean) : [];
  if (gallery.length > 0) return gallery.slice(0, 5);
  const productImages = Array.isArray(product.images) ? product.images.filter(Boolean) : [];
  if (productImages.length > 0) return productImages.slice(0, 5);
  const legacy = product.imageUrl || product.image || '';
  return legacy ? [legacy] : [];
}

function EmptyIcon({ children }) {
  return children || null;
}

function ProductDetail(props = {}) {
  const React = getReact();
  if (!React) return null;
  const product = props.product || {};
  const gallery = getGallery(product, props.gallery);
  const currentImageIndex = Math.max(0, Math.min(Number(props.currentImageIndex || 0), Math.max(gallery.length - 1, 0)));
  const selectedImage = gallery[currentImageIndex] || '';
  const [viewerOpen, setViewerOpen] = React.useState(false);
  const pointerState = React.useRef({ active: false, startX: 0, startY: 0 });
  const Icons = props.Icons || {};
  const ChevronLeft = Icons.ChevronLeft || EmptyIcon;
  const ChevronRight = Icons.ChevronRight || EmptyIcon;
  const sizesText = typeof props.productSizesText === 'function' ? props.productSizesText(product) : '';
  const colorsText = typeof props.productColorsText === 'function' ? props.productColorsText(product) : '';
  const summary = createPurchaseSummary(product, props.quantity ?? 1);
  const canBuy = summary.inStock;
  const addLabel = props.isInCart ? 'En el carrito' : 'Agregar al carrito';

  const setImageIndex = (index) => {
    if (!gallery.length || typeof props.setCurrentImageIndex !== 'function') return;
    const nextIndex = ((index % gallery.length) + gallery.length) % gallery.length;
    props.setCurrentImageIndex(nextIndex);
  };

  const moveImage = (delta) => setImageIndex(currentImageIndex + delta);

  const openViewer = (index = currentImageIndex) => {
    if (!gallery.length) return;
    setImageIndex(index);
    setViewerOpen(true);
  };

  const closeViewer = () => setViewerOpen(false);

  React.useEffect(() => {
    if (!viewerOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeViewer();
      if (event.key === 'ArrowLeft') moveImage(-1);
      if (event.key === 'ArrowRight') moveImage(1);
    };
    globalThis.addEventListener('keydown', onKeyDown);
    return () => globalThis.removeEventListener('keydown', onKeyDown);
  }, [viewerOpen, currentImageIndex, gallery.length]);

  const onPointerDown = (event) => {
    pointerState.current = { active: true, startX: event.clientX, startY: event.clientY };
  };

  const onPointerUp = (event) => {
    const state = pointerState.current;
    pointerState.current = { active: false, startX: 0, startY: 0 };
    if (!state.active || gallery.length <= 1) return;
    const deltaX = event.clientX - state.startX;
    const deltaY = event.clientY - state.startY;
    if (Math.abs(deltaX) < 45 || Math.abs(deltaX) < Math.abs(deltaY)) return;
    moveImage(deltaX > 0 ? -1 : 1);
  };

  const setQuantity = (value) => {
    const nextQuantity = clampQuantity(value, product);
    if (typeof props.onQuantityChange === 'function') props.onQuantityChange(nextQuantity);
  };

  const quantityBox = h('div', { className: 'bg-slate-50 rounded-2xl p-4 space-y-4' },
    h('div', { className: 'flex items-center justify-between gap-4 flex-wrap' },
      h('div', null,
        h('p', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400' }, 'Cantidad'),
        h('p', { className: 'text-sm font-bold text-slate-600' }, summary.stock > 0 ? `Disponibles: ${summary.stock}` : 'Producto agotado')
      ),
      h('div', { className: 'flex items-center bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm' },
        h('button', {
          type: 'button',
          className: 'drive-mx-product-quantity-button w-11 h-11 text-xl font-black text-slate-500 hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed',
          disabled: !canBuy || summary.quantity <= 1,
          onClick: () => setQuantity(summary.quantity - 1),
          'aria-label': 'Reducir cantidad'
        }, '−'),
        h('input', {
          type: 'number',
          min: summary.stock > 0 ? 1 : 0,
          max: summary.stock,
          step: 1,
          inputMode: 'numeric',
          className: 'drive-mx-product-quantity-input w-16 h-11 text-center text-sm font-black bg-white outline-none',
          value: summary.quantity,
          disabled: !canBuy,
          onChange: (event) => setQuantity(event.target.value),
          'aria-label': 'Cantidad seleccionada'
        }),
        h('button', {
          type: 'button',
          className: 'drive-mx-product-quantity-button w-11 h-11 text-xl font-black text-slate-500 hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed',
          disabled: !canBuy || summary.quantity >= summary.stock,
          onClick: () => setQuantity(summary.quantity + 1),
          'aria-label': 'Aumentar cantidad'
        }, '+')
      )
    ),
    h('div', { className: 'grid sm:grid-cols-3 gap-3' },
      h('div', { className: 'bg-white rounded-xl p-3 border border-slate-100' },
        h('p', { className: 'text-[9px] font-black uppercase text-slate-400' }, 'Precio por unidad'),
        h('p', { className: 'text-lg font-black text-red-500' }, formatMoney(summary.unitPrice))
      ),
      h('div', { className: 'bg-white rounded-xl p-3 border border-slate-100' },
        h('p', { className: 'text-[9px] font-black uppercase text-slate-400' }, 'Cantidad seleccionada'),
        h('p', { className: 'text-lg font-black text-slate-800' }, summary.quantity)
      ),
      h('div', { className: 'bg-white rounded-xl p-3 border border-slate-100' },
        h('p', { className: 'text-[9px] font-black uppercase text-slate-400' }, 'Total a pagar'),
        h('p', { className: 'text-lg font-black text-red-500' }, formatMoney(summary.lineTotal))
      )
    )
  );

  const viewer = viewerOpen ? h('div', {
    className: 'drive-mx-product-viewer',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Visor de imágenes del producto',
    onClick: (event) => { if (event.target === event.currentTarget) closeViewer(); }
  },
    h('button', { type: 'button', className: 'drive-mx-product-viewer-button drive-mx-product-viewer-close', onClick: closeViewer, 'aria-label': 'Cerrar visor' }, '×'),
    gallery.length > 1 ? h('button', { type: 'button', className: 'drive-mx-product-viewer-button drive-mx-product-viewer-arrow drive-mx-product-viewer-prev', onClick: () => moveImage(-1), 'aria-label': 'Imagen anterior' }, h(ChevronLeft, { size: 24 })) : null,
    h('div', {
      className: 'drive-mx-product-viewer-stage',
      onPointerDown,
      onPointerUp,
      onPointerCancel: () => { pointerState.current = { active: false, startX: 0, startY: 0 }; }
    },
      selectedImage ? h('img', { src: selectedImage, alt: `${product.name || 'Producto'} ${currentImageIndex + 1}`, className: 'drive-mx-product-viewer-image' }) : null
    ),
    gallery.length > 1 ? h('button', { type: 'button', className: 'drive-mx-product-viewer-button drive-mx-product-viewer-arrow drive-mx-product-viewer-next', onClick: () => moveImage(1), 'aria-label': 'Imagen siguiente' }, h(ChevronRight, { size: 24 })) : null,
    gallery.length > 1 ? h('div', { className: 'drive-mx-product-viewer-counter' }, `${currentImageIndex + 1} / ${gallery.length}`) : null
  ) : null;

  return h(React.Fragment, null,
    h('div', { className: 'w-full max-w-6xl py-6 animate-slide' },
      h('button', { type: 'button', onClick: props.onBack, className: 'mb-6 text-[10px] font-black uppercase text-slate-400 hover:text-red-500' }, '← Volver a productos'),
      h('div', { className: 'grid lg:grid-cols-2 gap-8 items-start' },
        h('div', { className: 'card-glass p-4 space-y-4' },
          h('button', {
            type: 'button',
            onClick: () => openViewer(currentImageIndex),
            className: 'drive-mx-product-main-image relative aspect-square bg-slate-100 rounded-[1.5rem] overflow-hidden flex items-center justify-center',
            'aria-label': selectedImage ? 'Abrir imagen en pantalla completa' : 'Producto sin fotografías'
          },
            selectedImage
              ? h('img', { src: selectedImage, alt: product.name || 'Producto', className: 'w-full h-full object-cover' })
              : h('div', { className: 'text-[10px] font-black text-slate-300 uppercase tracking-widest' }, 'Sin fotografías'),
            gallery.length > 0 ? h('span', { className: 'absolute right-4 bottom-4 px-3 py-2 rounded-full bg-white/90 text-[9px] font-black uppercase text-slate-500 shadow' }, 'Tocar para ampliar') : null
          ),
          gallery.length > 0 ? h('div', { className: 'grid grid-cols-5 gap-3' },
            gallery.map((img, index) => h('button', {
              key: `${img}_${index}`,
              type: 'button',
              onClick: () => openViewer(index),
              className: `drive-mx-product-thumb aspect-square rounded-xl overflow-hidden border-2 bg-slate-100 ${currentImageIndex === index ? 'border-red-500' : 'border-transparent'}`,
              'aria-label': `Abrir fotografía ${index + 1} en pantalla completa`
            }, h('img', { src: img, alt: `${product.name || 'Producto'} ${index + 1}`, className: 'w-full h-full object-cover' })))
          ) : null
        ),
        h('div', { className: 'card-glass p-8 lg:p-10 space-y-7' },
          h('div', null,
            h('p', { className: 'text-[10px] text-red-500 font-black uppercase tracking-widest mb-2' }, 'Detalle del producto'),
            h('h1', { className: 'text-3xl sm:text-4xl font-black tracking-tight leading-tight' }, product.name || 'Producto sin nombre')
          ),
          h('div', { className: 'flex flex-wrap items-center gap-4' },
            h('p', { className: 'text-4xl font-black text-red-500' }, formatMoney(summary.unitPrice)),
            h('span', { className: `px-4 py-2 rounded-full text-[10px] font-black uppercase ${summary.stock > 0 ? 'bg-slate-50 text-slate-500' : 'drive-mx-product-soldout-badge'}` }, summary.stock > 0 ? `Disponibles: ${summary.stock}` : 'Agotado')
          ),
          (sizesText || colorsText) ? h('div', { className: 'bg-slate-50 rounded-2xl p-4 grid sm:grid-cols-2 gap-3' },
            sizesText ? h('div', null, h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400' }, 'Medidas'), h('p', { className: 'text-sm font-black text-slate-700' }, sizesText)) : null,
            colorsText ? h('div', null, h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400' }, 'Colores'), h('p', { className: 'text-sm font-black text-slate-700' }, colorsText)) : null
          ) : null,
          quantityBox,
          h('div', { className: 'space-y-3' },
            h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400' }, 'Descripción'),
            h('p', { className: 'text-sm font-semibold text-slate-600 leading-relaxed whitespace-pre-line' }, product.description || 'Sin descripción registrada.')
          ),
          h('div', { className: 'space-y-3' },
            h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400' }, 'Especificaciones'),
            h('p', { className: 'text-sm font-semibold text-slate-600 leading-relaxed whitespace-pre-line' }, product.specifications || 'Sin especificaciones registradas.')
          ),
          h('div', { className: 'flex flex-col sm:flex-row gap-3' },
            h('button', { type: 'button', disabled: !canBuy, onClick: () => canBuy && props.onBuy?.(product, summary.quantity), className: 'btn-primary w-full sm:w-auto h-12 disabled:opacity-50 disabled:cursor-not-allowed' }, canBuy ? 'Comprar' : 'Agotado'),
            h('button', { type: 'button', disabled: !canBuy, onClick: () => canBuy && props.onAddToCart?.(product, summary.quantity), className: 'w-full sm:w-auto h-12 px-6 rounded-xl border-2 border-red-100 bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-red-50 disabled:hover:text-red-600' }, canBuy ? addLabel : 'Sin disponibilidad')
          )
        )
      )
    ),
    viewer
  );
}

injectStyles();

globalThis.DriveMxProductDetails = {
  ProductDetail,
  roundMoney,
  formatMoney,
  normalizeStock,
  getProductStock,
  normalizeQuantity,
  clampQuantity,
  getProductUnitPrice,
  getProductLineTotal,
  createPurchaseSummary,
  getGallery
};
