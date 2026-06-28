const h = globalThis.React?.createElement;

export function AdminTrackingPanel(props = {}) {
  if (!h) return null;
  const product = props.trackingResult;
  const getProductGallery = props.getProductGallery || (() => []);
  const productSizesText = props.productSizesText || (() => '');
  const productColorsText = props.productColorsText || (() => '');
  const productImage = product ? (getProductGallery(product)[0] || '') : '';

  return h('div', { className: 'w-full max-w-4xl py-6 space-y-6 animate-slide drive-mx-panel-tracking' },
    h('button', { onClick: () => props.setView?.('admin'), className: 'mb-2 text-[10px] font-black uppercase text-slate-400 hover:text-red-500' }, '← Volver al Panel de Control'),
    h('div', { className: 'card-glass p-6 space-y-5' },
      h('div', { className: 'text-center' },
        h('p', { className: 'text-[10px] text-red-500 font-black uppercase tracking-widest' }, 'Panel de Control'),
        h('h1', { className: 'text-3xl font-black tracking-tight' }, 'Buscador de Guías'),
        h('p', { className: 'text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1' }, 'Busca solo productos registrados por ID en el Panel de Control')
      ),
      h('div', { className: 'bg-slate-50 p-2 rounded-2xl border-2 border-slate-100 flex gap-2 max-w-xl mx-auto' },
        h('input', { className: 'flex-grow bg-transparent px-4 text-sm font-bold uppercase outline-none', placeholder: 'INGRESE ID DEL PRODUCTO', value: props.searchQuery || '', onChange: (e) => props.runTrackingSearch?.(e.target.value, false) }),
        h('button', { onClick: () => props.runTrackingSearch?.(props.searchQuery, true), className: 'btn-primary' }, 'Buscar')
      ),
      props.trackingNotFound ? h('p', { className: 'text-center text-[10px] font-black text-red-500 uppercase tracking-widest' }, 'No se encontró el producto') : null,
      (!product && !props.trackingNotFound) ? h('p', { className: 'text-center text-[10px] font-black text-slate-300 uppercase tracking-widest' }, 'Ingresa el ID del producto registrado en el Panel de Control') : null,
      product ? h('div', { className: 'card-glass p-6 max-w-3xl mx-auto animate-slide' },
        h('div', { className: 'flex flex-col sm:flex-row gap-5' },
          h('div', { className: 'w-full sm:w-44 h-44 rounded-2xl bg-slate-100 overflow-hidden shrink-0' },
            productImage ? h('img', { src: productImage, alt: product?.name || 'Producto', className: 'w-full h-full object-cover' }) : h('div', { className: 'w-full h-full flex items-center justify-center text-[10px] font-black text-slate-300 uppercase' }, 'Sin foto')
          ),
          h('div', { className: 'flex-grow space-y-4' },
            h('div', null,
              h('p', { className: 'text-[9px] font-black text-slate-400 uppercase mb-1' }, 'ID (Guías de envío Noo)'),
              h('h2', { className: 'text-3xl font-black text-red-600' }, `#${product.id}`)
            ),
            h('div', { className: 'bg-slate-50 rounded-2xl p-4 grid sm:grid-cols-2 gap-4' },
              h('div', null, h('p', { className: 'text-[8px] font-black text-slate-400 uppercase' }, 'Foto'), h('p', { className: 'text-sm font-black text-slate-900' }, productImage ? 'Foto disponible' : 'Sin foto')),
              h('div', null, h('p', { className: 'text-[8px] font-black text-slate-400 uppercase' }, 'Nombre'), h('p', { className: 'text-sm font-black text-slate-900' }, product.name || 'Producto sin nombre')),
              h('div', null, h('p', { className: 'text-[8px] font-black text-slate-400 uppercase' }, 'ID (Guías de envío Noo)'), h('p', { className: 'text-sm font-mono font-black text-slate-700' }, product.id || '-')),
              productSizesText(product) ? h('div', null, h('p', { className: 'text-[8px] font-black text-slate-400 uppercase' }, 'Medidas'), h('p', { className: 'text-sm font-black text-slate-900' }, productSizesText(product))) : null,
              productColorsText(product) ? h('div', null, h('p', { className: 'text-[8px] font-black text-slate-400 uppercase' }, 'Colores'), h('p', { className: 'text-sm font-black text-slate-900' }, productColorsText(product))) : null
            )
          )
        )
      ) : null
    )
  );
}
