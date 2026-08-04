const DEFAULT_CATEGORY = 'general';
const SUPERMARKET_CATEGORY = 'supermercado';
const PRODUCTS_PER_RAIL = 20;

const CATEGORY_OPTIONS = Object.freeze([
  Object.freeze({ value: DEFAULT_CATEGORY, label: 'Productos Drive MX' }),
  Object.freeze({ value: SUPERMARKET_CATEGORY, label: 'Supermercado' })
]);

function injectStyles() {
  const id = 'drive-mx-supermercado-stylesheet';
  if (!globalThis.document || globalThis.document.getElementById(id)) return;
  const link = globalThis.document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = new URL('./supermercado-module.css', import.meta.url).href;
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

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function normalizeCategory(value) {
  const normalized = normalizeText(value);
  if (normalized === 'supermercado' || normalized === 'super market' || normalized === 'supermarket') {
    return SUPERMARKET_CATEGORY;
  }
  if (
    normalized === ''
    || normalized === 'general'
    || normalized === 'productos drive mx'
    || normalized === 'producto drive mx'
    || normalized === 'drive mx'
  ) {
    return DEFAULT_CATEGORY;
  }
  return normalized.replace(/\s+/g, '-') || DEFAULT_CATEGORY;
}

function getProductCategory(product = {}) {
  return normalizeCategory(product.category ?? product.categoria ?? product.productCategory ?? product.product_category);
}

function getCategoryFields(source = {}) {
  return { category: getProductCategory(source) };
}

function setFormCategory(form = {}, category = DEFAULT_CATEGORY) {
  return { ...(form || {}), category: normalizeCategory(category) };
}

function isSupermarketProduct(product = {}) {
  return getProductCategory(product) === SUPERMARKET_CATEGORY;
}

function partitionProducts(products = []) {
  const standard = [];
  const supermarket = [];

  (Array.isArray(products) ? products : []).forEach((product) => {
    if (!product) return;
    if (isSupermarketProduct(product)) supermarket.push(product);
    else standard.push(product);
  });

  return { standard, supermarket };
}

function getCategoryLabel(value) {
  const normalized = normalizeCategory(value);
  return CATEGORY_OPTIONS.find((option) => option.value === normalized)?.label || String(value || 'Productos Drive MX');
}

function ProductCategorySelector(props = {}) {
  const React = getReact();
  if (!React) return null;

  const form = props.form || {};
  const setForm = props.setForm;
  const value = getProductCategory(form);
  const selectorId = props.id || 'drive-mx-product-category';
  const options = CATEGORY_OPTIONS.some((option) => option.value === value)
    ? CATEGORY_OPTIONS
    : [...CATEGORY_OPTIONS, { value, label: getCategoryLabel(value) }];

  const handleChange = (event) => {
    if (typeof setForm !== 'function') return;
    const nextCategory = normalizeCategory(event.target.value);
    setForm((previous) => setFormCategory(previous, nextCategory));
  };

  return h('label', {
    className: props.className || 'md:col-span-5 space-y-2',
    htmlFor: selectorId,
    'data-drive-mx-category-selector': 'true'
  },
    h('span', { className: 'block text-[10px] font-black uppercase text-slate-600' }, props.label || 'Categoría del producto'),
    h('select', {
      id: selectorId,
      required: true,
      className: props.selectClassName || 'input-field',
      value,
      onChange: handleChange,
      'aria-label': props.label || 'Categoría del producto'
    },
      options.map((option) => h('option', { key: option.value, value: option.value }, option.label))
    )
  );
}

function getProductImage(product, getProductGallery) {
  const gallery = typeof getProductGallery === 'function' ? getProductGallery(product) : [];
  return gallery?.[0] || product?.imageUrl || product?.image || '';
}

function ChevronLeftIcon() {
  return h('svg', {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.5,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true'
  }, h('path', { d: 'm15 18-6-6 6-6' }));
}

function ChevronRightIcon() {
  return h('svg', {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.5,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true'
  }, h('path', { d: 'm9 18 6-6-6-6' }));
}

function SupermarketProductCard(props = {}) {
  const product = props.product || {};
  const image = getProductImage(product, props.getProductGallery);
  const stock = Math.max(0, Math.floor(Number(product.stock ?? product.availableStock ?? 0)));
  const soldOut = stock <= 0;

  const openProduct = () => {
    if (typeof props.onProductClick === 'function') props.onProductClick(product);
  };

  return h('article', {
    className: 'drive-mx-supermercado-card bg-white rounded-[1.35rem] border border-slate-100 overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer',
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
        ? h('img', { src: image, alt: product.name || 'Producto de supermercado', className: 'w-full h-full object-cover', loading: 'lazy' })
        : h('div', { className: 'w-full h-full flex items-center justify-center text-[10px] font-black text-slate-300 uppercase tracking-widest' }, 'Sin foto')
    ),
    h('div', { className: 'p-5 space-y-3' },
      h('h3', { className: 'drive-mx-supermercado-card-title text-sm font-black text-slate-900 leading-tight' }, product.name || 'Producto sin nombre'),
      h('div', { className: 'flex items-center justify-between gap-3' },
        h('p', { className: 'text-xl font-black text-red-500' }, `$${Number(product.price || 0).toFixed(2)}`),
        h('span', { className: `px-3 py-1 rounded-full text-[9px] font-black uppercase ${soldOut ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-500'}` }, soldOut ? 'Agotado' : `Stock: ${stock}`)
      )
    )
  );
}

function SupermarketRail(props = {}) {
  const React = getReact();
  if (!React) return null;
  const railRef = React.useRef(null);
  const products = Array.isArray(props.products) ? props.products : [];

  const scrollRail = (direction) => {
    const rail = railRef.current;
    if (!rail) return;
    const amount = Math.max(260, Math.min(rail.clientWidth * 0.9, 900));
    rail.scrollBy({ left: direction * amount, behavior: 'smooth' });
  };

  const productStart = props.blockIndex * PRODUCTS_PER_RAIL + 1;
  const productEnd = productStart + products.length - 1;

  return h('div', { className: 'space-y-4', 'data-supermercado-block': String(props.blockIndex + 1) },
    h('div', { className: 'flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3' },
      h('div', null,
        h('p', { className: 'text-[9px] font-black text-slate-400 uppercase tracking-widest' }, `Carrusel ${props.blockIndex + 1}${props.totalBlocks > 1 ? ` de ${props.totalBlocks}` : ''}`),
        h('h3', { className: 'text-lg font-black tracking-tight text-slate-900' }, `Productos ${productStart}-${productEnd}`)
      ),
      h('div', { className: 'flex gap-2' },
        h('button', { type: 'button', className: 'drive-mx-supermercado-arrow', 'aria-label': 'Desplazar productos a la izquierda', onClick: () => scrollRail(-1) }, h(ChevronLeftIcon, null)),
        h('button', { type: 'button', className: 'drive-mx-supermercado-arrow', 'aria-label': 'Desplazar productos a la derecha', onClick: () => scrollRail(1) }, h(ChevronRightIcon, null))
      )
    ),
    h('div', { className: 'drive-mx-supermercado-rail-shell' },
      h('div', { ref: railRef, className: 'drive-mx-supermercado-rail', role: 'list', 'aria-label': `Productos de supermercado, bloque ${props.blockIndex + 1}` },
        products.map((product, index) => h(SupermarketProductCard, {
          key: product.id || `${props.blockIndex}_${index}`,
          product,
          getProductGallery: props.getProductGallery,
          onProductClick: props.onProductClick
        }))
      )
    )
  );
}

function chunkProducts(products = [], size = PRODUCTS_PER_RAIL) {
  const chunks = [];
  for (let index = 0; index < products.length; index += size) {
    chunks.push(products.slice(index, index + size));
  }
  return chunks;
}

function SupermarketSection(props = {}) {
  const React = getReact();
  if (!React) return null;

  const products = (Array.isArray(props.products) ? props.products : [])
    .filter((product) => product && product.active !== false && isSupermarketProduct(product));
  const blocks = chunkProducts(products, Number(props.productsPerRail || PRODUCTS_PER_RAIL));

  return h('section', { className: 'drive-mx-supermercado w-full space-y-7', 'data-drive-mx-supermercado-section': 'true' },
    h('div', { className: 'flex items-end justify-between gap-4 mb-1' },
      h('div', null,
        h('p', { className: 'text-[10px] text-red-500 font-black uppercase tracking-widest' }, 'Categoría disponible'),
        h('h2', { className: 'text-2xl font-black tracking-tight' }, 'Supermercado')
      ),
      h('p', { className: 'hidden sm:block text-[9px] font-bold text-slate-400 uppercase tracking-widest' }, 'Actualizado automáticamente')
    ),
    blocks.length > 0
      ? blocks.map((block, index) => h(SupermarketRail, {
          key: `supermercado_block_${index}`,
          products: block,
          blockIndex: index,
          totalBlocks: blocks.length,
          getProductGallery: props.getProductGallery,
          onProductClick: props.onProductClick
        }))
      : h('div', { className: 'drive-mx-supermercado-empty' },
          h('p', { className: 'text-[10px] font-black text-slate-400 uppercase tracking-widest' }, 'Aún no hay productos de supermercado disponibles'),
          h('p', { className: 'text-[9px] font-bold text-slate-300 uppercase tracking-widest mt-1' }, 'Los productos activos aparecerán aquí automáticamente')
        )
  );
}

injectStyles();

globalThis.DriveMxSupermercadoModule = Object.freeze({
  DEFAULT_CATEGORY,
  SUPERMARKET_CATEGORY,
  CATEGORY_OPTIONS,
  PRODUCTS_PER_RAIL,
  normalizeCategory,
  getProductCategory,
  getCategoryFields,
  setFormCategory,
  isSupermarketProduct,
  partitionProducts,
  ProductCategorySelector,
  SupermarketSection
});
