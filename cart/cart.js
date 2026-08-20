(function (global) {
  'use strict';

  const React = global.React;
  const h = React?.createElement;
  const useEffect = React?.useEffect;

  function injectStyles() {
    const id = 'drive-mx-cart-stylesheet';
    if (!global.document || global.document.getElementById(id)) return;
    const script = global.document.currentScript;
    const link = global.document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = script?.src ? new URL('./cart.css', script.src).href : './cart/cart.css';
    global.document.head.appendChild(link);
  }

  function safeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function formatMoney(value) {
    return safeNumber(value).toFixed(2);
  }

  function ShoppingCartModal(props = {}) {
    if (!h || !useEffect) return null;

    const products = Array.isArray(props.products) ? props.products.filter(Boolean) : [];
    const driveMxMaxItems = Math.max(1, Math.floor(safeNumber(props.driveMxMaxItems, 2)));
    const supermarketMinimumProducts = Math.max(1, Math.floor(safeNumber(props.supermarketMinimumProducts, 5)));
    const ttlMinutes = Math.max(1, Math.round(safeNumber(props.ttlMinutes, 30)));
    const driveMxProductCount = Math.max(0, Math.floor(safeNumber(props.driveMxProductCount)));
    const supermarketProductCount = Math.max(0, Math.floor(safeNumber(props.supermarketProductCount)));
    const totalQuantity = Math.max(0, Math.floor(safeNumber(props.totalQuantity)));
    const subtotal = Math.max(0, safeNumber(props.subtotal));
    const getProductStock = typeof props.getProductStock === 'function'
      ? props.getProductStock
      : (product) => Math.max(0, Math.floor(safeNumber(product?.stock ?? product?.availableStock)));
    const getProductLineTotal = typeof props.getProductLineTotal === 'function'
      ? props.getProductLineTotal
      : (product, quantity) => safeNumber(product?.unitPrice ?? product?.price) * Math.max(1, Math.floor(safeNumber(quantity, 1)));
    const hasInvalidProduct = products.some((product) => safeNumber(product?.quantity) < 1 || getProductStock(product) <= 0);
    const checkoutDisabled = products.length === 0 || hasInvalidProduct;

    useEffect(() => {
      if (!props.isOpen) return undefined;
      const body = global.document?.body;
      if (!body) return undefined;
      const previousOverflow = body.style.overflow;
      const previousPaddingRight = body.style.paddingRight;
      const scrollbarWidth = Math.max(0, global.innerWidth - global.document.documentElement.clientWidth);
      body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
      return () => {
        body.style.overflow = previousOverflow;
        body.style.paddingRight = previousPaddingRight;
      };
    }, [props.isOpen]);

    useEffect(() => {
      if (!props.isOpen) return undefined;
      const handleKeyDown = (event) => {
        if (event.key === 'Escape') props.onClose?.();
      };
      global.addEventListener?.('keydown', handleKeyDown);
      return () => global.removeEventListener?.('keydown', handleKeyDown);
    }, [props.isOpen, props.onClose]);

    if (!props.isOpen) return null;

    return h('div', {
      className: 'drive-mx-cart-overlay',
      role: 'presentation'
    },
      h('section', {
        className: 'drive-mx-cart-dialog animate-slide',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'drive-mx-cart-title'
      },
        h('header', { className: 'drive-mx-cart-header bg-slate-50 border-b border-slate-100 px-4 sm:px-5 py-4 flex items-start justify-between gap-3' },
          h('div', { className: 'min-w-0' },
            h('p', { className: 'text-[9px] text-red-500 font-black uppercase tracking-widest' }, 'Carrito de compra'),
            h('h2', { id: 'drive-mx-cart-title', className: 'text-xl font-black tracking-tight' }, 'Productos seleccionados'),
            h('p', { className: 'text-[9px] font-bold text-slate-400 uppercase mt-1 leading-relaxed' }, `Drive MX: máximo ${driveMxMaxItems} productos · Supermercado: mínimo ${supermarketMinimumProducts} productos en el carrito · la cantidad de cada producto es libre · se limpia automáticamente en ${ttlMinutes} minutos`)
          ),
          h('button', {
            type: 'button',
            onClick: props.onClose,
            className: 'w-10 h-10 shrink-0 rounded-xl bg-white text-slate-400 hover:text-red-500 font-black text-xl',
            'aria-label': 'Cerrar carrito'
          }, '×')
        ),

        h('div', { className: 'drive-mx-cart-body' },
          products.length === 0
            ? h('div', { className: 'text-center py-8 bg-slate-50 rounded-2xl' },
                h('p', { className: 'text-[10px] font-black text-slate-400 uppercase tracking-widest' }, 'Tu carrito está vacío'),
                h('p', { className: 'text-[10px] font-bold text-slate-300 uppercase mt-1' }, 'Agrega productos desde el detalle de cada publicación')
              )
            : h('div', { className: 'space-y-3' },
                products.map((product) => {
                  const quantity = Math.max(1, Math.floor(safeNumber(product?.quantity, 1)));
                  const stock = getProductStock(product);
                  return h('article', { key: product?.id, className: 'bg-slate-50 rounded-2xl p-3 sm:p-4' },
                    h('div', { className: 'flex items-start justify-between gap-3' },
                      h('div', { className: 'min-w-0 flex-1' },
                        h('p', { className: 'drive-mx-cart-product-name text-sm font-black text-slate-900' }, product?.name || 'Producto'),
                        h('p', { className: 'text-[9px] font-bold text-slate-400 uppercase mt-1' }, `Unitario: $${formatMoney(product?.unitPrice ?? product?.price)}`)
                      ),
                      h('div', { className: 'text-right shrink-0' },
                        h('p', { className: 'text-sm font-black text-red-500' }, `$${formatMoney(getProductLineTotal(product, quantity))}`),
                        h('button', {
                          type: 'button',
                          onClick: () => props.onRemoveProduct?.(product?.id),
                          className: 'text-[8px] font-black uppercase text-slate-300 hover:text-red-500 mt-1'
                        }, 'Quitar')
                      )
                    ),
                    h('div', { className: 'flex flex-wrap items-center gap-2 mt-3' },
                      h('button', {
                        type: 'button',
                        disabled: quantity <= 1,
                        onClick: () => props.onUpdateQuantity?.(product?.id, quantity - 1),
                        className: 'w-9 h-9 rounded-lg bg-white border border-slate-200 text-slate-500 font-black disabled:opacity-40',
                        'aria-label': `Reducir cantidad de ${product?.name || 'producto'}`
                      }, '−'),
                      h('input', {
                        type: 'number',
                        min: '1',
                        max: String(Math.max(1, stock)),
                        value: quantity,
                        onChange: (event) => props.onUpdateQuantity?.(product?.id, event.target.value),
                        className: 'w-20 h-9 rounded-lg bg-white border border-slate-200 text-center text-xs font-black outline-none',
                        'aria-label': `Cantidad seleccionada de ${product?.name || 'producto'}`
                      }),
                      h('button', {
                        type: 'button',
                        disabled: quantity >= stock,
                        onClick: () => props.onUpdateQuantity?.(product?.id, quantity + 1),
                        className: 'w-9 h-9 rounded-lg bg-white border border-slate-200 text-slate-500 font-black disabled:opacity-40',
                        'aria-label': `Aumentar cantidad de ${product?.name || 'producto'}`
                      }, '+'),
                      h('span', { className: 'text-[8px] font-black text-slate-400 uppercase' }, `Disponibles: ${stock}`)
                    ),
                    stock <= 0 ? h('p', { className: 'text-[8px] font-black text-red-500 uppercase mt-2' }, 'Agotado') : null
                  );
                })
              )
        ),

        h('footer', { className: 'drive-mx-cart-footer space-y-3' },
          h('div', { className: 'flex items-end justify-between gap-4' },
            h('div', { className: 'min-w-0' },
              h('p', { className: 'text-[9px] font-black text-slate-400 uppercase' }, 'Total acumulado'),
              h('p', { className: 'text-[9px] font-bold text-slate-300 uppercase' }, `${products.length} producto${products.length === 1 ? '' : 's'} · ${totalQuantity} unidad${totalQuantity === 1 ? '' : 'es'}`),
              driveMxProductCount > 0
                ? h('p', { className: 'text-[9px] font-black uppercase text-slate-400' }, `Drive MX: ${driveMxProductCount}/${driveMxMaxItems} productos máximos`)
                : null,
              supermarketProductCount > 0
                ? h('p', { className: `text-[9px] font-black uppercase ${supermarketProductCount >= supermarketMinimumProducts ? 'text-slate-400' : 'text-red-500'}` }, `Supermercado: ${supermarketProductCount}/${supermarketMinimumProducts} productos mínimos en el carrito`)
                : null
            ),
            h('p', { className: 'text-2xl font-black text-red-500 shrink-0' }, `$${formatMoney(subtotal)}`)
          ),
          h('button', {
            type: 'button',
            onClick: props.onCheckout,
            disabled: checkoutDisabled,
            className: 'drive-mx-cart-buy-button btn-primary disabled:opacity-50 disabled:cursor-not-allowed'
          }, 'Quiero comprar')
        )
      )
    );
  }

  injectStyles();

  global.DriveMxCart = {
    ShoppingCartModal
  };
})(window);
