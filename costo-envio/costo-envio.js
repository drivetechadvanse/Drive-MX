import '../supermercado-module/supermercado-core.js';

const DEFAULT_SHIPPING_COST = 150;
const MAX_SHIPPING_COST = 1000000;
const SHIPPING_MODE_FREE = 'free';
const SHIPPING_MODE_MANUAL = 'manual';
const SHIPPING_MODE_FIELD = 'supermarketShippingMode';
const SHIPPING_COST_FIELD = 'supermarketShippingCost';
const SHIPPING_ACCEPTED_FIELD = 'supermarketShippingAccepted';
const SETTINGS_COLLECTION = 'supermarket_settings';
const SETTINGS_DOCUMENT = 'config';
const SETTINGS_LOCAL_KEY = 'driveMxSupermarketSettings';

const Supermercado = globalThis.DriveMxSupermercado || globalThis.DriveMxSupermercadoCore || {};
const SupermercadoCore = globalThis.DriveMxSupermercadoCore || Supermercado;
const originalCopyCategory = typeof Supermercado.copyCategory === 'function'
  ? Supermercado.copyCategory.bind(Supermercado)
  : ((target = {}, source = {}) => ({ ...target, category: source?.category || target?.category || '' }));

function clean(value) {
  return String(value ?? '').trim();
}

function fold(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .trim();
}

function roundMoney(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : fallback;
}

function normalizeFee(value, fallback = DEFAULT_SHIPPING_COST) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > MAX_SHIPPING_COST) return roundMoney(fallback, DEFAULT_SHIPPING_COST);
  return roundMoney(number, DEFAULT_SHIPPING_COST);
}

function normalizeManualFee(value, fallback = DEFAULT_SHIPPING_COST) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > MAX_SHIPPING_COST) return normalizeFee(fallback, DEFAULT_SHIPPING_COST);
  return roundMoney(number, DEFAULT_SHIPPING_COST);
}

function normalizeShippingMode(value) {
  const normalized = fold(value);
  if (['free', 'gratis', 'sin costo', 'sin costo de envio', 'sin envio', '0'].includes(normalized)) return SHIPPING_MODE_FREE;
  if (['manual', 'cost', 'paid', 'costo', 'costo de envio', 'con costo'].includes(normalized)) return SHIPPING_MODE_MANUAL;
  return SHIPPING_MODE_MANUAL;
}

function isSupermarketProduct(product = {}) {
  if (typeof Supermercado.isSupermarketProduct === 'function') return Supermercado.isSupermarketProduct(product);
  if (typeof SupermercadoCore.isSupermarketProduct === 'function') return SupermercadoCore.isSupermarketProduct(product);
  return fold(product?.category || product?.categoria || product?.productCategory || '') === 'supermercado';
}

function hasOwn(source, field) {
  return Boolean(source && typeof source === 'object' && Object.prototype.hasOwnProperty.call(source, field));
}

function hasExplicitShippingConfiguration(source = {}) {
  return hasOwn(source, SHIPPING_MODE_FIELD)
    || hasOwn(source, SHIPPING_COST_FIELD)
    || hasOwn(source, 'supermarketShippingType')
    || hasOwn(source, 'supermarketShippingFee');
}

function getShippingConfiguration(source = {}, options = {}) {
  if (!source || typeof source !== 'object' || !hasExplicitShippingConfiguration(source)) return null;
  const fallbackCost = normalizeFee(options.defaultCost, DEFAULT_SHIPPING_COST);
  const mode = normalizeShippingMode(source[SHIPPING_MODE_FIELD] ?? source.supermarketShippingType);
  const cost = mode === SHIPPING_MODE_FREE
    ? 0
    : normalizeManualFee(source[SHIPPING_COST_FIELD] ?? source.supermarketShippingFee, fallbackCost);
  return { mode, cost };
}

function createProductFormState(base = {}, source = {}, options = {}) {
  const fallbackCost = normalizeFee(options.defaultCost, DEFAULT_SHIPPING_COST);
  const configuration = getShippingConfiguration(source, { defaultCost: fallbackCost })
    || getShippingConfiguration(base, { defaultCost: fallbackCost });
  const accepted = hasOwn(source, SHIPPING_ACCEPTED_FIELD)
    ? source[SHIPPING_ACCEPTED_FIELD] === true
    : Boolean(configuration);

  return {
    ...base,
    [SHIPPING_MODE_FIELD]: configuration?.mode || SHIPPING_MODE_MANUAL,
    [SHIPPING_COST_FIELD]: configuration?.mode === SHIPPING_MODE_FREE ? 0 : (configuration?.cost ?? fallbackCost),
    [SHIPPING_ACCEPTED_FIELD]: accepted
  };
}

function validateProductShipping(source = {}, options = {}) {
  if (!isSupermarketProduct(source)) return { ok: true, mode: '', cost: 0 };

  const fallbackCost = normalizeFee(options.defaultCost, DEFAULT_SHIPPING_COST);
  const mode = normalizeShippingMode(source[SHIPPING_MODE_FIELD]);
  const requireAccepted = options.requireAccepted !== false;

  if (requireAccepted && source[SHIPPING_ACCEPTED_FIELD] !== true) {
    return { ok: false, message: 'Selecciona la opción de envío y presiona Aceptar antes de guardar el producto.' };
  }

  if (mode === SHIPPING_MODE_FREE) return { ok: true, mode, cost: 0 };

  const rawCost = Number(source[SHIPPING_COST_FIELD]);
  if (!Number.isFinite(rawCost) || rawCost <= 0 || rawCost > MAX_SHIPPING_COST) {
    return { ok: false, message: 'Ingresa un costo de envío válido mayor a $0 y presiona Aceptar.' };
  }

  return { ok: true, mode, cost: normalizeManualFee(rawCost, fallbackCost) };
}

function applyShippingToProduct(product = {}, source = {}, options = {}) {
  const categorizedProduct = { ...product };
  if (!isSupermarketProduct(categorizedProduct) && !isSupermarketProduct(source)) {
    delete categorizedProduct[SHIPPING_MODE_FIELD];
    delete categorizedProduct[SHIPPING_COST_FIELD];
    delete categorizedProduct[SHIPPING_ACCEPTED_FIELD];
    return categorizedProduct;
  }

  const validation = validateProductShipping(source, {
    defaultCost: options.defaultCost,
    requireAccepted: options.requireAccepted === true
  });
  if (!validation.ok) throw new Error(validation.message);

  categorizedProduct[SHIPPING_MODE_FIELD] = validation.mode;
  categorizedProduct[SHIPPING_COST_FIELD] = validation.mode === SHIPPING_MODE_FREE ? 0 : validation.cost;
  delete categorizedProduct[SHIPPING_ACCEPTED_FIELD];
  return categorizedProduct;
}

function copyProductShipping(target = {}, source = {}) {
  const next = { ...target };
  if (!isSupermarketProduct(source) && !isSupermarketProduct(next)) {
    delete next[SHIPPING_MODE_FIELD];
    delete next[SHIPPING_COST_FIELD];
    delete next[SHIPPING_ACCEPTED_FIELD];
    return next;
  }

  const configuration = getShippingConfiguration(source);
  if (!configuration) return next;
  next[SHIPPING_MODE_FIELD] = configuration.mode;
  next[SHIPPING_COST_FIELD] = configuration.mode === SHIPPING_MODE_FREE ? 0 : configuration.cost;
  delete next[SHIPPING_ACCEPTED_FIELD];
  return next;
}

function copyCategory(target = {}, source = {}) {
  return copyProductShipping(originalCopyCategory(target, source), source);
}

function normalizeSettings(settings = {}) {
  return {
    shippingFee: normalizeFee(settings?.shippingFee ?? settings?.supermarketShippingFee, DEFAULT_SHIPPING_COST)
  };
}

function getProductShippingFee(product = {}, options = {}) {
  const generalShippingFee = normalizeFee(options.generalShippingFee, DEFAULT_SHIPPING_COST);
  if (!isSupermarketProduct(product)) return generalShippingFee;

  const supermarketShippingFee = normalizeFee(options.supermarketShippingFee, generalShippingFee);
  const configuration = getShippingConfiguration(product, { defaultCost: supermarketShippingFee });
  if (!configuration) return supermarketShippingFee;
  return configuration.mode === SHIPPING_MODE_FREE ? 0 : configuration.cost;
}

function getCartShippingFee(products = [], options = {}) {
  const items = Array.isArray(products) ? products.filter(Boolean) : [];
  if (items.length === 0) return 0;

  const generalShippingFee = normalizeFee(options.generalShippingFee, DEFAULT_SHIPPING_COST);
  const supermarketShippingFee = normalizeFee(options.supermarketShippingFee, generalShippingFee);
  let total = 0;
  let containsGeneralProduct = false;
  let containsUnconfiguredSupermarketProduct = false;

  items.forEach((product) => {
    if (!isSupermarketProduct(product)) {
      containsGeneralProduct = true;
      return;
    }

    const configuration = getShippingConfiguration(product, { defaultCost: supermarketShippingFee });
    if (!configuration) {
      containsUnconfiguredSupermarketProduct = true;
      return;
    }
    if (configuration.mode === SHIPPING_MODE_MANUAL) total += configuration.cost;
  });

  // La lógica anterior cobraba una sola tarifa base por carrito. Se conserva
  // para productos generales y para publicaciones de Supermercado que todavía
  // no tengan una configuración explícita, evitando duplicar esa tarifa en un
  // carrito mixto. Los importes manuales sí permanecen asociados a cada producto.
  const legacyCartFee = Math.max(
    containsGeneralProduct ? generalShippingFee : 0,
    containsUnconfiguredSupermarketProduct ? supermarketShippingFee : 0
  );
  return roundMoney(total + legacyCartFee, 0);
}

function getShippingLabel(product = {}, options = {}) {
  if (!isSupermarketProduct(product)) return '';
  const fee = getProductShippingFee(product, options);
  return fee === 0 ? 'Sin costo de envío' : `Costo de envío: $${fee.toFixed(2)}`;
}

function getReact() {
  return globalThis.React || null;
}

function h(type, props, ...children) {
  const React = getReact();
  return React ? React.createElement(type, props, ...children) : null;
}

function ShippingCostSelector(props = {}) {
  const React = getReact();
  if (!React) return null;
  const generatedId = typeof React.useId === 'function'
    ? React.useId()
    : React.useMemo(() => `shipping-${Math.random().toString(36).slice(2)}`, []);
  const mode = normalizeShippingMode(props.mode);
  const cost = props.cost ?? '';
  const disabled = Boolean(props.disabled || props.saving);
  const name = props.name || `shipping-mode-${generatedId}`;

  return h('div', { className: props.className || 'rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-4' },
    props.showTitle === false
      ? null
      : h('div', null,
          h('h3', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-600' }, 'Costo de envío'),
          props.description
            ? h('p', { className: 'text-[8px] font-bold uppercase text-slate-400 mt-1' }, props.description)
            : null
        ),
    h('div', { className: 'grid sm:grid-cols-2 gap-3' },
      h('label', { className: `flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer ${mode === SHIPPING_MODE_FREE ? 'border-red-200 bg-white text-red-600' : 'border-slate-100 bg-white text-slate-500'}` },
        h('input', {
          type: 'radio',
          name,
          value: SHIPPING_MODE_FREE,
          checked: mode === SHIPPING_MODE_FREE,
          disabled,
          onChange: () => props.onModeChange?.(SHIPPING_MODE_FREE)
        }),
        h('span', { className: 'text-[10px] font-black uppercase' }, 'Sin costo de envío')
      ),
      h('label', { className: `flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer ${mode === SHIPPING_MODE_MANUAL ? 'border-red-200 bg-white text-red-600' : 'border-slate-100 bg-white text-slate-500'}` },
        h('input', {
          type: 'radio',
          name,
          value: SHIPPING_MODE_MANUAL,
          checked: mode === SHIPPING_MODE_MANUAL,
          disabled,
          onChange: () => props.onModeChange?.(SHIPPING_MODE_MANUAL)
        }),
        h('span', { className: 'text-[10px] font-black uppercase' }, 'Costo de envío')
      )
    ),
    mode === SHIPPING_MODE_MANUAL
      ? h('div', { className: 'grid sm:grid-cols-[1fr_auto] gap-3 items-end' },
          h('div', null,
            h('label', { className: 'block text-[9px] font-black uppercase text-slate-400 mb-2' }, 'Importe manual'),
            h('input', {
              type: 'number',
              min: '0.01',
              max: String(MAX_SHIPPING_COST),
              step: '0.01',
              inputMode: 'decimal',
              className: 'input-field bg-white',
              placeholder: '0.00',
              value: cost,
              disabled,
              onChange: (event) => props.onCostChange?.(event.target.value)
            })
          ),
          h('button', {
            type: 'button',
            disabled,
            onClick: () => props.onAccept?.({ mode, cost }),
            className: 'btn-primary h-12 disabled:opacity-50 disabled:cursor-not-allowed'
          }, props.saving ? 'Guardando...' : 'Aceptar')
        )
      : h('button', {
          type: 'button',
          disabled,
          onClick: () => props.onAccept?.({ mode, cost: 0 }),
          className: 'btn-primary h-12 disabled:opacity-50 disabled:cursor-not-allowed'
        }, props.saving ? 'Guardando...' : 'Aceptar'),
    props.accepted
      ? h('p', { className: 'text-[8px] font-black uppercase text-green-600' }, 'Configuración aceptada')
      : null,
    props.statusMessage
      ? h('p', { className: `text-[8px] font-black uppercase ${props.statusType === 'error' ? 'text-red-500' : 'text-green-600'}` }, props.statusMessage)
      : null
  );
}

function ProductShippingCostFields(props = {}) {
  const productForm = props.productForm || {};
  const setProductForm = props.setProductForm;
  if (typeof setProductForm !== 'function' || !isSupermarketProduct(productForm)) return null;

  const fallbackCost = normalizeFee(props.defaultCost, DEFAULT_SHIPPING_COST);
  const mode = normalizeShippingMode(productForm[SHIPPING_MODE_FIELD]);
  const cost = productForm[SHIPPING_COST_FIELD] ?? fallbackCost;
  const accepted = productForm[SHIPPING_ACCEPTED_FIELD] === true;

  const onModeChange = (nextMode) => {
    setProductForm((previous = {}) => ({
      ...previous,
      [SHIPPING_MODE_FIELD]: nextMode,
      [SHIPPING_COST_FIELD]: nextMode === SHIPPING_MODE_FREE
        ? 0
        : (Number(previous[SHIPPING_COST_FIELD]) > 0 ? previous[SHIPPING_COST_FIELD] : fallbackCost),
      [SHIPPING_ACCEPTED_FIELD]: false
    }));
  };

  const onCostChange = (nextCost) => {
    setProductForm((previous = {}) => ({
      ...previous,
      [SHIPPING_COST_FIELD]: nextCost,
      [SHIPPING_ACCEPTED_FIELD]: false
    }));
  };

  const onAccept = ({ mode: nextMode, cost: nextCost }) => {
    const candidate = {
      ...productForm,
      [SHIPPING_MODE_FIELD]: nextMode,
      [SHIPPING_COST_FIELD]: nextMode === SHIPPING_MODE_FREE ? 0 : nextCost,
      [SHIPPING_ACCEPTED_FIELD]: true
    };
    const validation = validateProductShipping(candidate, { defaultCost: fallbackCost, requireAccepted: true });
    if (!validation.ok) {
      globalThis.alert?.(validation.message);
      return;
    }
    setProductForm((previous = {}) => ({
      ...previous,
      [SHIPPING_MODE_FIELD]: validation.mode,
      [SHIPPING_COST_FIELD]: validation.cost,
      [SHIPPING_ACCEPTED_FIELD]: true
    }));
  };

  return h(ShippingCostSelector, {
    className: props.className || 'md:col-span-5 rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-4',
    description: 'Esta configuración se aplica únicamente cuando la categoría es Supermercado',
    mode,
    cost,
    accepted,
    onModeChange,
    onCostChange,
    onAccept
  });
}

function AdminShippingProductRow({ product = {}, manager = {}, defaultCost = DEFAULT_SHIPPING_COST } = {}) {
  const React = getReact();
  if (!React) return null;
  const fallbackCost = normalizeFee(defaultCost, DEFAULT_SHIPPING_COST);
  const currentConfiguration = getShippingConfiguration(product, { defaultCost: fallbackCost });
  const [mode, setMode] = React.useState(currentConfiguration?.mode || SHIPPING_MODE_MANUAL);
  const [cost, setCost] = React.useState(currentConfiguration?.mode === SHIPPING_MODE_FREE ? 0 : (currentConfiguration?.cost ?? fallbackCost));
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState({ message: '', type: '' });

  React.useEffect(() => {
    const next = getShippingConfiguration(product, { defaultCost: fallbackCost });
    setMode(next?.mode || SHIPPING_MODE_MANUAL);
    setCost(next?.mode === SHIPPING_MODE_FREE ? 0 : (next?.cost ?? fallbackCost));
    setStatus({ message: '', type: '' });
  }, [product?.id, product?.updatedAt, product?.[SHIPPING_MODE_FIELD], product?.[SHIPPING_COST_FIELD], fallbackCost]);

  const accept = async ({ mode: nextMode, cost: nextCost }) => {
    const candidate = {
      ...product,
      [SHIPPING_MODE_FIELD]: nextMode,
      [SHIPPING_COST_FIELD]: nextMode === SHIPPING_MODE_FREE ? 0 : nextCost,
      [SHIPPING_ACCEPTED_FIELD]: true
    };
    const validation = validateProductShipping(candidate, { defaultCost: fallbackCost, requireAccepted: true });
    if (!validation.ok) {
      setStatus({ message: validation.message, type: 'error' });
      return;
    }
    if (typeof manager.saveProductShippingConfiguration !== 'function') {
      setStatus({ message: 'No se encontró la función para guardar el costo de envío.', type: 'error' });
      return;
    }

    setSaving(true);
    setStatus({ message: '', type: '' });
    try {
      await manager.saveProductShippingConfiguration(product, {
        [SHIPPING_MODE_FIELD]: validation.mode,
        [SHIPPING_COST_FIELD]: validation.cost,
        [SHIPPING_ACCEPTED_FIELD]: true
      });
      setMode(validation.mode);
      setCost(validation.cost);
      setStatus({ message: 'Costo de envío guardado correctamente.', type: 'success' });
    } catch (error) {
      console.error('Guardar costo de envío del producto:', error);
      setStatus({ message: error?.message || 'No se pudo guardar el costo de envío.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const ProductsCore = globalThis.DriveMxProductsCore || {};
  const sourceLabel = typeof ProductsCore.isUserPanelPublication === 'function' && ProductsCore.isUserPanelPublication(product)
    ? 'Panel de Usuarios'
    : 'Panel de Control';

  return h('article', { className: 'rounded-2xl border border-slate-100 bg-white p-4 space-y-4' },
    h('div', { className: 'flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2' },
      h('div', { className: 'min-w-0' },
        h('p', { className: 'text-sm font-black text-slate-800 break-words' }, product.name || 'Producto sin nombre'),
        h('p', { className: 'text-[8px] font-bold uppercase text-slate-400 mt-1' }, `${sourceLabel} · ${product.id || ''}`)
      ),
      h('span', { className: 'text-[8px] font-black uppercase text-red-500' }, getShippingLabel(product, { supermarketShippingFee: fallbackCost }))
    ),
    h(ShippingCostSelector, {
      showTitle: false,
      className: 'rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-4',
      name: `shipping-mode-${product.id || Math.random().toString(36).slice(2)}`,
      mode,
      cost,
      saving,
      statusMessage: status.message,
      statusType: status.type,
      onModeChange: (nextMode) => {
        setMode(nextMode);
        if (nextMode === SHIPPING_MODE_FREE) setCost(0);
        else if (!(Number(cost) > 0)) setCost(fallbackCost);
        setStatus({ message: '', type: '' });
      },
      onCostChange: (nextCost) => {
        setCost(nextCost);
        setStatus({ message: '', type: '' });
      },
      onAccept: accept
    })
  );
}

function AdminShippingCostPanel({ manager = {} } = {}) {
  const ProductsCore = globalThis.DriveMxProductsCore || {};
  const allProducts = Array.isArray(manager.allProducts)
    ? manager.allProducts
    : (Array.isArray(manager.publicProducts) ? manager.publicProducts : []);
  const supermarketProducts = allProducts.filter(isSupermarketProduct);
  const sortedProducts = typeof ProductsCore.sortProducts === 'function'
    ? ProductsCore.sortProducts(supermarketProducts)
    : supermarketProducts;
  const defaultCost = normalizeFee(manager.supermarketSettings?.shippingFee, DEFAULT_SHIPPING_COST);

  return h('div', { className: 'card-glass overflow-hidden', id: 'admin-shipping-cost-section' },
    h('div', { className: 'bg-slate-50 border-b border-slate-100 px-6 py-4' },
      h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400 drive-mx-panel-section-title' }, 'Costo de envío'),
      h('p', { className: 'text-[9px] font-bold text-slate-300 uppercase mt-1' }, 'Configuración exclusiva para productos de Supermercado publicados desde Panel de Control o Panel de Usuarios')
    ),
    h('div', { className: 'p-6 space-y-4' },
      sortedProducts.length > 0
        ? sortedProducts.map((product) => h(AdminShippingProductRow, {
            key: product.id,
            product,
            manager,
            defaultCost
          }))
        : h('p', { className: 'py-6 text-center text-[10px] font-bold text-slate-300 uppercase' }, 'Aún no hay productos de Supermercado para configurar')
    )
  );
}

const api = {
  DEFAULT_SHIPPING_COST,
  MAX_SHIPPING_COST,
  SHIPPING_MODE_FREE,
  SHIPPING_MODE_MANUAL,
  SHIPPING_MODE_FIELD,
  SHIPPING_COST_FIELD,
  SHIPPING_ACCEPTED_FIELD,
  SETTINGS_COLLECTION,
  SETTINGS_DOCUMENT,
  SETTINGS_LOCAL_KEY,
  normalizeShippingMode,
  normalizeSettings,
  hasExplicitShippingConfiguration,
  getShippingConfiguration,
  createProductFormState,
  validateProductShipping,
  applyShippingToProduct,
  copyProductShipping,
  getProductShippingFee,
  getCartShippingFee,
  getShippingLabel,
  ShippingCostSelector,
  ProductShippingCostFields,
  AdminShippingCostPanel
};

globalThis.DriveMxCostoEnvio = api;
Object.assign(Supermercado, {
  SETTINGS_COLLECTION,
  SETTINGS_DOCUMENT,
  SETTINGS_LOCAL_KEY,
  normalizeSettings,
  copyCategory,
  getProductShippingFee,
  getCartShippingFee,
  getShippingLabel
});
if (SupermercadoCore && SupermercadoCore !== Supermercado) {
  Object.assign(SupermercadoCore, {
    SETTINGS_COLLECTION,
    SETTINGS_DOCUMENT,
    SETTINGS_LOCAL_KEY,
    normalizeSettings,
    copyCategory,
    getProductShippingFee,
    getCartShippingFee,
    getShippingLabel
  });
}
