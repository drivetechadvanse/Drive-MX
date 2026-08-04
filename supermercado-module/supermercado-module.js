import './supermercado-core.js';

const Core = globalThis.DriveMxSupermercadoCore || {};
const PRODUCTS_PER_RAIL = 20;

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
  return React ? React.createElement(type, props, ...children) : null;
}

function ProductCategorySelect(props = {}) {
  const value = Core.normalizeCategory?.(props.value) || '';
  const isKnownCategory = !value || Core.isSupermarketCategory?.(value);
  const className = props.className || 'md:col-span-5';

  return h('div', { className: `${className} drive-mx-supermercado-selector` },
    h('label', { className: 'block text-[10px] font-black uppercase text-slate-600 mb-2' }, 'Categoría del producto'),
    h('select', {
      className: 'input-field bg-white',
      value,
      onChange: (event) => typeof props.onChange === 'function' && props.onChange(event.target.value),
      'aria-label': 'Categoría del producto'
    },
      h('option', { value: '' }, 'Productos Drive MX'),
      !isKnownCategory ? h('option', { value }, `Categoría actual: ${value}`) : null,
      h('option', { value: Core.CATEGORY || 'supermercado' }, Core.LABEL || 'Supermercado')
    ),
    h('p', { className: 'text-[8px] font-bold text-slate-400 uppercase mt-2' }, 'Selecciona Supermercado para mostrar el producto únicamente en esa sección de la portada')
  );
}

function getProductImage(product = {}, getProductGallery) {
  const gallery = typeof getProductGallery === 'function' ? getProductGallery(product) : [];
  return gallery?.[0] || product.imageUrl || product.image || '';
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

function SupermarketProductCard({ product, onProductClick, getProductGallery }) {
  const image = getProductImage(product, getProductGallery);
  const stock = Math.max(0, Math.floor(Number(product?.stock ?? product?.availableStock ?? 0)));
  const isSoldOut = stock <= 0;
  const openProduct = () => typeof onProductClick === 'function' && onProductClick(product);

  return h('article', {
    className: 'drive-mx-supermercado-card bg-white rounded-[1.35rem] border border-slate-100 overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer',
    role: 'button',
    tabIndex: 0,
    'data-category': Core.CATEGORY || 'supermercado',
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
        ? h('img', { src: image, alt: product?.name || 'Producto de supermercado', className: 'w-full h-full object-cover', loading: 'lazy' })
        : h('div', { className: 'w-full h-full flex items-center justify-center text-[10px] font-black text-slate-300 uppercase tracking-widest' }, 'Sin foto')
    ),
    h('div', { className: 'p-5 space-y-3' },
      h('div', null,
        h('p', { className: 'text-[8px] font-black uppercase tracking-widest text-red-500 mb-1' }, 'Supermercado'),
        h('h3', { className: 'drive-mx-supermercado-card-title text-sm font-black text-slate-900 leading-tight' }, product?.name || 'Producto sin nombre')
      ),
      h('div', { className: 'flex items-center justify-between gap-3' },
        h('p', { className: 'text-xl font-black text-red-500' }, `$${Number(product?.price || 0).toFixed(2)}`),
        h('span', { className: `px-3 py-1 rounded-full text-[9px] font-black uppercase ${isSoldOut ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-500'}` }, isSoldOut ? 'Agotado' : `Stock: ${stock}`)
      )
    )
  );
}

function SupermarketRail({ products, blockIndex, totalBlocks, getProductGallery, onProductClick }) {
  const React = getReact();
  if (!React) return null;
  const railRef = React.useRef(null);
  const productStart = blockIndex * PRODUCTS_PER_RAIL + 1;
  const productEnd = productStart + products.length - 1;

  const scrollRail = (direction) => {
    const rail = railRef.current;
    if (!rail) return;
    const amount = Math.max(260, Math.min(rail.clientWidth * 0.9, 900));
    rail.scrollBy({ left: direction * amount, behavior: 'smooth' });
  };

  return h('section', { className: 'drive-mx-supermercado-block space-y-4', 'data-supermercado-block': String(blockIndex + 1) },
    h('div', { className: 'flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3' },
      h('div', null,
        h('p', { className: 'text-[9px] font-black text-slate-400 uppercase tracking-widest' }, `Carrusel ${blockIndex + 1}${totalBlocks > 1 ? ` de ${totalBlocks}` : ''}`),
        h('h3', { className: 'text-lg font-black tracking-tight text-slate-900' }, `Supermercado ${productStart}-${productEnd}`)
      ),
      h('div', { className: 'flex gap-2' },
        h('button', { type: 'button', className: 'drive-mx-supermercado-arrow', 'aria-label': `Desplazar supermercado ${blockIndex + 1} a la izquierda`, onClick: () => scrollRail(-1) }, h(ChevronLeftIcon)),
        h('button', { type: 'button', className: 'drive-mx-supermercado-arrow', 'aria-label': `Desplazar supermercado ${blockIndex + 1} a la derecha`, onClick: () => scrollRail(1) }, h(ChevronRightIcon))
      )
    ),
    h('div', { className: 'drive-mx-supermercado-rail-shell' },
      h('div', { ref: railRef, className: 'drive-mx-supermercado-rail', role: 'list', 'aria-label': `Productos de supermercado, bloque ${blockIndex + 1}` },
        products.map((product, index) => h(SupermarketProductCard, {
          key: product?.id || `supermercado_${blockIndex}_${index}`,
          product,
          getProductGallery,
          onProductClick
        }))
      )
    )
  );
}

function SupermercadoHomeSection(props = {}) {
  const products = Core.getSupermarketProducts?.(props.products || []) || [];
  const blocks = [];
  for (let index = 0; index < products.length; index += PRODUCTS_PER_RAIL) {
    blocks.push(products.slice(index, index + PRODUCTS_PER_RAIL));
  }

  return h('section', { className: 'drive-mx-supermercado w-full space-y-7', id: 'supermercado-section' },
    h('div', { className: 'flex items-end justify-between gap-4 mb-1' },
      h('div', null,
        h('p', { className: 'text-[10px] text-red-500 font-black uppercase tracking-widest' }, 'Categoría'),
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
          h('p', { className: 'text-[9px] font-bold text-slate-300 uppercase tracking-widest mt-1' }, 'Los productos aparecerán aquí al publicarse con la categoría Supermercado')
        )
  );
}

injectStyles();

globalThis.DriveMxSupermercado = {
  ...Core,
  PRODUCTS_PER_RAIL,
  ProductCategorySelect,
  SupermercadoHomeSection
};
