import { AD_FALLBACK_TEXT, buildInventoryItemsWithAds, getActiveAds } from '../services/adsService.js';

const h = globalThis.React?.createElement;

function AdSlot({ ad, slotIndex = 0 }) {
  if (!h) return null;
  const imageUrl = ad?.imageUrl || ad?.image || '';
  return h('div', { className: 'drive-mx-ad-slot sm:col-span-2 lg:col-span-3 xl:col-span-4', 'data-ad-slot': String(slotIndex + 1) },
    imageUrl
      ? h('img', { src: imageUrl, alt: ad?.fileName || 'Anuncio publicitario Drive MX', className: 'drive-mx-ad-image' })
      : h('div', { className: 'drive-mx-ad-fallback' }, AD_FALLBACK_TEXT)
  );
}

function ProductCard({ product, onProductClick, getProductGallery }) {
  if (!h) return null;
  const gallery = typeof getProductGallery === 'function' ? getProductGallery(product) : [];
  const image = gallery?.[0] || product?.imageUrl || product?.image || '';
  return h('article', {
    key: product?.id,
    onClick: () => typeof onProductClick === 'function' && onProductClick(product),
    className: 'bg-white rounded-[1.35rem] border border-slate-100 overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer'
  },
    h('div', { className: 'aspect-[4/3] bg-slate-100 overflow-hidden' },
      image
        ? h('img', { src: image, alt: product?.name || 'Producto', className: 'w-full h-full object-cover' })
        : h('div', { className: 'w-full h-full flex items-center justify-center text-[10px] font-black text-slate-300 uppercase tracking-widest' }, 'Sin foto')
    ),
    h('div', { className: 'p-5 space-y-3' },
      h('div', null,
        h('h3', { className: 'text-sm font-black text-slate-900 leading-tight' }, product?.name || 'Producto sin nombre')
      ),
      h('div', { className: 'flex items-center justify-between gap-3' },
        h('p', { className: 'text-xl font-black text-red-500' }, `$${Number(product?.price || 0).toFixed(2)}`),
        h('span', { className: 'px-3 py-1 bg-slate-50 rounded-full text-[9px] font-black text-slate-500 uppercase' }, `Stock: ${Number(product?.stock || 0)}`)
      )
    )
  );
}

export function PublicInventoryGrid(props = {}) {
  if (!h) return null;
  const React = globalThis.React;
  const products = Array.isArray(props.products) ? props.products : [];
  const activeAds = getActiveAds(props.ads || []);
  const [rotationIndex, setRotationIndex] = React.useState(0);

  React.useEffect(() => {
    if (activeAds.length <= 1) return undefined;
    const timer = globalThis.setInterval(() => setRotationIndex((current) => current + 1), Number(props.rotationMs || 7000));
    return () => globalThis.clearInterval(timer);
  }, [activeAds.length, props.rotationMs]);

  const resolveAdForSlot = (slotIndex) => {
    if (activeAds.length === 0) return null;
    return activeAds[(slotIndex + rotationIndex) % activeAds.length];
  };

  return h('div', { className: 'grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5' },
    buildInventoryItemsWithAds(products).map((item) => {
      if (item.type === 'ad') {
        return h(AdSlot, { key: item.key, ad: resolveAdForSlot(item.slotIndex), slotIndex: item.slotIndex });
      }
      return h(ProductCard, {
        key: item.key,
        product: item.product,
        onProductClick: props.onProductClick,
        getProductGallery: props.getProductGallery
      });
    })
  );
}
