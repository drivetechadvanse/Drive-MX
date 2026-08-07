const h = globalThis.React?.createElement;
const noop = () => {};
const EmptyIcon = () => null;
const toArray = (value) => Array.isArray(value) ? value : [];

function getOrderProducts(transfer = {}) {
  if (Array.isArray(transfer.order?.products) && transfer.order.products.length > 0) return transfer.order.products;
  if (transfer.order?.product) return [transfer.order.product];
  return [];
}

function normalizeOrderQuantity(item = {}) {
  const quantity = Math.floor(Number(item.quantity || item.productQuantity || item.selectedQuantity || 1));
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

function getOrderUnitPrice(item = {}) {
  return Number(item.unitPrice ?? item.productUnitPrice ?? item.productPrice ?? item.price ?? 0);
}

function getOrderLineTotal(item = {}) {
  const quantity = normalizeOrderQuantity(item);
  const unitPrice = getOrderUnitPrice(item);
  return Number((Number(item.lineTotal ?? item.totalPrice ?? item.productTotal ?? item.productCost ?? unitPrice * quantity) || 0).toFixed(2));
}

export function AdminHeader(props = {}) {
  if (!h) return null;
  const Icons = props.Icons || {};
  const MenuIcon = Icons.Menu || EmptyIcon;
  const setShowAdminMenu = props.setShowAdminMenu || noop;
  return h('div', { className: 'flex justify-between items-start gap-4' },
    h('div', null,
      h('h1', { className: 'text-3xl font-black' }, 'Panel ', h('span', { className: 'text-red-500' }, 'Admin')),
      h('p', { className: 'text-[10px] font-bold text-slate-400 uppercase' }, 'Gestión Central')
    ),
    h('div', { className: 'flex items-start gap-3 relative' },
      h('button', {
        type: 'button',
        onClick: () => setShowAdminMenu(!props.showAdminMenu),
        className: 'w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:text-red-500 shadow-sm'
      }, h(MenuIcon)),
      props.showAdminMenu ? h('div', { className: 'absolute right-0 top-14 w-56 bg-white border border-slate-100 rounded-2xl shadow-xl p-2 z-50 animate-slide' },
        h('button', { type: 'button', onClick: props.openAdminTracking || noop, className: 'w-full text-left px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-red-50 hover:text-red-600' }, 'Buscador de Guías'),
        h('button', { type: 'button', onClick: props.openAdminSupport || noop, className: 'w-full text-left px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-red-50 hover:text-red-600' }, 'Soporte Técnico')
      ) : null
    )
  );
}

export function EmailSettingsCard(props = {}) {
  if (!h) return null;
  const settings = props.emailSettings || {};
  const setEmailSettings = props.setEmailSettings || noop;
  return h('div', { className: 'card-glass overflow-hidden' },
    h('div', { className: 'bg-slate-50 border-b border-slate-100 px-6 py-4' },
      h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400 drive-mx-panel-section-title' }, 'Configuración de Correo'),
      h('p', { className: 'text-[9px] font-bold text-slate-300 uppercase mt-1' }, 'Gmail para notificaciones automáticas de pedidos')
    ),
    h('form', { onSubmit: props.saveEmailSettings || noop, className: 'p-6 grid md:grid-cols-1 gap-3' },
      h('div', null,
        h('label', { className: 'block text-[9px] font-black uppercase text-slate-400 mb-2' }, 'Correo electrónico remitente'),
        h('input', { required: true, type: 'email', className: 'input-field', placeholder: 'correo@gmail.com', value: settings.senderEmail || '', onChange: (e) => setEmailSettings({ ...settings, senderEmail: e.target.value }) })
      ),
      h('div', null,
        h('label', { className: 'block text-[9px] font-black uppercase text-slate-400 mb-2' }, 'Contraseña de aplicación Gmail'),
        h('input', { required: true, type: 'password', autoComplete: 'new-password', className: 'input-field', placeholder: 'Contraseña de aplicación', value: settings.appPassword || '', onChange: (e) => setEmailSettings({ ...settings, appPassword: e.target.value }) })
      ),
      h('div', null,
        h('label', { className: 'block text-[9px] font-black uppercase text-slate-400 mb-2' }, 'Correo base receptor'),
        h('input', { required: true, type: 'email', className: 'input-field', placeholder: 'pedidos@empresa.com', value: settings.receiverEmail || '', onChange: (e) => setEmailSettings({ ...settings, receiverEmail: e.target.value }) })
      ),
      h('button', { disabled: props.emailSaving, type: 'submit', className: 'btn-primary h-12 disabled:opacity-50 disabled:cursor-not-allowed' }, props.emailSaving ? 'Guardando...' : 'Guardar Configuración de Correo')
    )
  );
}

export function PaymentSettingsCard(props = {}) {
  if (!h) return null;
  const settings = props.paymentSettings || {};
  const setPaymentSettings = props.setPaymentSettings || noop;
  return h('div', { className: 'card-glass overflow-hidden' },
    h('div', { className: 'bg-slate-50 border-b border-slate-100 px-6 py-4' },
      h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400 drive-mx-panel-section-title' }, 'Configuración de Pagos'),
      h('p', { className: 'text-[9px] font-bold text-slate-300 uppercase mt-1' }, 'Cuenta Banco Azteca para copiar y pegar')
    ),
    h('form', { onSubmit: props.savePaymentSettings || noop, className: 'p-6 grid md:grid-cols-1 gap-3' },
      h('div', null,
        h('label', { className: 'block text-[9px] font-black uppercase text-slate-400 mb-2' }, 'Número de cuenta bancaria'),
        h('input', { required: true, type: 'text', className: 'input-field', placeholder: 'Cuenta Banco Azteca', value: settings.bankAccount || '', onChange: (e) => setPaymentSettings({ ...settings, bankAccount: e.target.value }) })
      ),
      h('button', { disabled: props.paymentSaving, type: 'submit', className: 'btn-primary h-12 disabled:opacity-50 disabled:cursor-not-allowed' }, props.paymentSaving ? 'Guardando...' : 'Guardar Configuración de Pagos')
    )
  );
}

export function PendingTransfersCard(props = {}) {
  if (!h) return null;
  const transfers = toArray(props.pendingSalesTransfers);
  const productOptionsLines = props.productOptionsLines || (() => []);
  const sessionUser = props.sessionUser || {};
  const transferTrackingDrafts = props.transferTrackingDrafts || {};
  const setTransferTrackingDrafts = props.setTransferTrackingDrafts || noop;

  return h('div', { className: 'card-glass overflow-hidden' },
    h('div', { className: 'bg-slate-50 border-b border-slate-100 px-6 py-4' },
      h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400 drive-mx-panel-section-title' }, 'Transferencias Pendientes'),
      h('p', { className: 'text-[9px] font-bold text-slate-300 uppercase mt-1' }, 'Solo ventas: las solicitudes pendientes no envían correo ni se procesan hasta marcar Pagado')
    ),
    h('div', { className: 'overflow-x-auto drive-mx-panel-table-wrap' },
      h('table', { className: 'w-full text-left' },
        h('thead', { className: 'bg-white border-b border-slate-50' },
          h('tr', { className: 'text-[8px] font-black uppercase text-slate-400' },
            h('th', { className: 'px-6 py-3' }, 'Titular'),
            h('th', { className: 'px-6 py-3' }, 'Fecha y hora'),
            h('th', { className: 'px-6 py-3' }, 'Estado'),
            h('th', { className: 'px-6 py-3' }, 'Detalle'),
            h('th', { className: 'px-6 py-3' }, 'Guía del producto'),
            h('th', { className: 'px-6 py-3 text-right' }, 'Acciones')
          )
        ),
        h('tbody', { className: 'divide-y divide-slate-50' },
          transfers.map((transfer) => {
            const transferId = transfer.id || transfer.transferId;
            const transferProducts = getOrderProducts(transfer);
            return h('tr', { key: transferId, className: 'text-[10px] font-bold text-slate-600 align-top' },
              h('td', { className: 'px-6 py-4 font-black text-slate-800' }, transfer.holderName),
              h('td', { className: 'px-6 py-4' }, transfer.createdAt ? new Date(transfer.createdAt).toLocaleString('es-MX') : '-'),
              h('td', { className: 'px-6 py-4' }, h('span', { className: `px-2 py-1 rounded-full text-[8px] uppercase ${transfer.status === 'Pagado' ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-700'}` }, transfer.status)),
              h('td', { className: 'px-6 py-4' },
                transfer.type === 'wallet_recharge'
                  ? h('div', null,
                      h('p', { className: 'font-black text-slate-800' }, 'Recarga de saldo a favor'),
                      h('p', { className: 'text-slate-400 font-mono' }, `Usuario: ${transfer.userEmail || transfer.userId || transfer.walletId || ''}`),
                      h('p', { className: 'text-red-600 font-black' }, `$${Number(transfer.amount || 0).toFixed(2)} MXN`),
                      h('p', { className: 'text-slate-400' }, transfer.userPhone || '')
                    )
                  : h(globalThis.React.Fragment, null,
                      transferProducts.map((product, index) => {
                        const quantity = normalizeOrderQuantity(product);
                        const unitPrice = getOrderUnitPrice(product);
                        const lineTotal = getOrderLineTotal(product);
                        return h('div', { key: `${transferId}_${product.id || index}`, className: index > 0 ? 'mt-2 pt-2 border-t border-slate-100' : '' },
                          h('p', { className: 'font-black' }, product.name),
                          h('p', { className: 'text-slate-500 font-bold' }, `Cantidad: ${quantity} · Unitario: $${unitPrice.toFixed(2)}`),
                          h('p', { className: 'text-red-600 font-black' }, `Total producto: $${lineTotal.toFixed(2)}`),
                          productOptionsLines(product).map((line) => h('p', { key: line, className: 'text-slate-400 uppercase' }, line))
                        );
                      }),
                      h('p', { className: 'text-slate-500 font-bold mt-2' }, `Gastos de envio: $${Number(transfer.order?.cart?.shippingFee ?? 150).toFixed(2)}`),
                      h('p', { className: 'text-slate-800 font-black' }, `Total: $${Number(transfer.order?.cart?.total || (transferProducts.reduce((total, product) => total + getOrderLineTotal(product), 0) + Number(transfer.order?.cart?.shippingFee ?? 150))).toFixed(2)}`),
                      h('p', { className: 'text-slate-400' }, `${transfer.order?.delivery?.phone || ''} · ${transfer.order?.delivery?.email || ''}`)
                    )
              ),
              h('td', { className: 'px-6 py-4 min-w-[210px]' },
                transfer.type === 'wallet_recharge'
                  ? h('span', { className: 'text-[8px] font-black uppercase text-slate-300' }, 'No aplica')
                  : h('div', { className: 'space-y-2' },
                      h('input', { className: 'input-field uppercase text-[10px]', placeholder: 'NÚMERO DE GUÍA', value: transferTrackingDrafts[transferId] ?? transfer.trackingNumber ?? '', onChange: (e) => setTransferTrackingDrafts((prev) => ({ ...prev, [transferId]: e.target.value })) }),
                      h('button', { type: 'button', onClick: () => props.assignTrackingToTransfer?.(transfer), className: 'px-3 py-2 bg-red-50 text-red-600 rounded-xl text-[8px] font-black uppercase' }, 'Guardar guía'),
                      transfer.trackingNumber ? h('p', { className: 'text-[8px] font-black text-green-600 uppercase' }, `Guía asociada: ${transfer.trackingNumber}`) : null
                    )
              ),
              h('td', { className: 'px-6 py-4 text-right' },
                h('div', { className: 'flex justify-end gap-2 flex-wrap' },
                  sessionUser?.role === 'admin' && transfer.status === 'Pendiente' ? h('button', { onClick: () => props.markTransferPaid?.(transfer), disabled: props.orderSending, className: 'px-3 py-2 bg-green-50 text-green-600 rounded-xl text-[8px] font-black uppercase disabled:opacity-50' }, 'Pagado') : null,
                  sessionUser?.role === 'admin' && transfer.status === 'Pagado' && transfer.emailStatus !== 'Enviado' ? h('button', { onClick: () => props.markTransferPaid?.(transfer), disabled: props.orderSending, className: 'px-3 py-2 bg-amber-50 text-amber-700 rounded-xl text-[8px] font-black uppercase disabled:opacity-50' }, 'Reintentar correo') : null,
                  sessionUser?.role === 'admin' ? h('button', { type: 'button', onClick: () => props.deleteTransfer?.(transfer), className: 'px-3 py-2 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-xl text-[8px] font-black uppercase' }, 'Eliminar') : null
                )
              )
            );
          }),
          transfers.length === 0 ? h('tr', null, h('td', { colSpan: '6', className: 'px-6 py-8 text-center text-[10px] font-bold text-slate-300 uppercase' }, 'No hay transferencias pendientes de ventas registradas')) : null
        )
      )
    )
  );
}

export function CompletedSalesCard(props = {}) {
  if (!h) return null;
  const Icons = props.Icons || {};
  const TrashIcon = Icons.Trash || EmptyIcon;
  const sales = toArray(props.completedSales);
  const normalizeProductSizes = props.normalizeProductSizes || (() => []);
  const normalizeProductColors = props.normalizeProductColors || (() => []);

  return h('div', { className: 'card-glass overflow-hidden' },
    h('div', { className: 'bg-slate-50 border-b border-slate-100 px-6 py-4' },
      h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400 drive-mx-panel-section-title' }, 'Ventas Realizadas'),
      h('p', { className: 'text-[9px] font-bold text-slate-300 uppercase mt-1' }, 'Registro automático de ventas pagadas y datos del vendedor')
    ),
    h('div', { className: 'overflow-x-auto drive-mx-panel-table-wrap' },
      h('table', { className: 'w-full text-left' },
        h('thead', { className: 'bg-white border-b border-slate-50' },
          h('tr', { className: 'text-[8px] font-black uppercase text-slate-400' },
            h('th', { className: 'px-6 py-3' }, 'Usuario vendedor'),
            h('th', { className: 'px-6 py-3' }, 'Correo electrónico'),
            h('th', { className: 'px-6 py-3' }, 'Teléfono'),
            h('th', { className: 'px-6 py-3' }, 'Costo vendido'),
            h('th', { className: 'px-6 py-3' }, 'Fecha y hora'),
            h('th', { className: 'px-6 py-3 text-right' }, 'Acciones')
          )
        ),
        h('tbody', { className: 'divide-y divide-slate-50' },
          sales.map((sale) => {
            const sizes = normalizeProductSizes(sale.productSizes);
            const colors = normalizeProductColors(sale.productColors);
            const quantity = normalizeOrderQuantity(sale);
            const unitPrice = getOrderUnitPrice(sale);
            const lineTotal = getOrderLineTotal(sale);
            return h('tr', { key: sale.id || sale.saleId, className: 'text-[10px] font-bold text-slate-600 align-top' },
              h('td', { className: 'px-6 py-4' },
                h('p', { className: 'font-black text-slate-800' }, sale.sellerName || '-'),
                h('p', { className: 'text-[8px] text-slate-400 uppercase' }, sale.productName || sale.productId || ''),
                sizes.length > 0 ? h('p', { className: 'text-[8px] text-slate-400 uppercase' }, `Medidas: ${sizes.join(', ')}`) : null,
                colors.length > 0 ? h('p', { className: 'text-[8px] text-slate-400 uppercase' }, `Colores: ${colors.join(', ')}`) : null
              ),
              h('td', { className: 'px-6 py-4 font-mono text-slate-400' }, sale.sellerEmail || '-'),
              h('td', { className: 'px-6 py-4 font-mono text-slate-400' }, sale.sellerPhone || '-'),
              h('td', { className: 'px-6 py-4' },
                h('p', { className: 'text-red-600 font-black' }, `$${lineTotal.toFixed(2)}`),
                h('p', { className: 'text-[8px] text-slate-400 uppercase' }, `Cantidad: ${quantity} · Unitario: $${unitPrice.toFixed(2)}`)
              ),
              h('td', { className: 'px-6 py-4' }, sale.soldAt ? new Date(sale.soldAt).toLocaleString('es-MX') : '-'),
              h('td', { className: 'px-6 py-4 text-right' }, h('button', { type: 'button', onClick: () => props.deleteCompletedSale?.(sale), className: 'px-3 py-2 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-xl text-[8px] font-black uppercase inline-flex items-center gap-1' }, h(TrashIcon, { size: 11 }), ' Eliminar'))
            );
          }),
          sales.length === 0 ? h('tr', null, h('td', { colSpan: '6', className: 'px-6 py-8 text-center text-[10px] font-bold text-slate-300 uppercase' }, 'Aún no hay ventas realizadas registradas')) : null
        )
      )
    )
  );
}

// Compatibilidad con la interfaz anterior de PanelControl. La lógica completa
// vive ahora en packages-guides/packages-guides.js; este componente solo adapta
// las propiedades antiguas para no romper importaciones existentes.
export function ActiveShipmentsCard(props = {}) {
  if (!h) return null;
  const PackagesGuidesUI = globalThis.DriveMxPackagesGuides || {};
  if (typeof PackagesGuidesUI.AdminShipmentsCard !== 'function') return null;
  const manager = props.manager || {
    pkgs: toArray(props.pkgs),
    deletePackage: (pkg) => props.deletePkg?.(pkg?.id || pkg),
    findProductByTracking: props.findProductByTracking || (() => null)
  };
  return h(PackagesGuidesUI.AdminShipmentsCard, { manager, Icons: props.Icons || {} });
}


// La lógica del CRUD y la sincronización con la portada permanece en
// admin-products/admin-products.js. Este adaptador acepta tanto el nuevo
// administrador modular como las propiedades antiguas para evitar que la
// sección desaparezca si el módulo todavía no terminó de cargar.
function resolveProductsAdminManager(props = {}) {
  const ProductsCore = globalThis.DriveMxProductsCore || {};
  const source = props.manager && typeof props.manager === 'object' ? props.manager : {};
  const rawForm = source.productForm && typeof source.productForm === 'object'
    ? source.productForm
    : (props.productForm && typeof props.productForm === 'object' ? props.productForm : {});

  const productForm = {
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
    active: true,
    ...rawForm,
    sizes: toArray(rawForm.sizes),
    colors: toArray(rawForm.colors).length > 0 ? toArray(rawForm.colors) : [''],
    images: toArray(rawForm.images)
  };

  const normalizeProductSizes = source.normalizeProductSizes
    || props.normalizeProductSizes
    || ProductsCore.normalizeProductSizes
    || ((value) => toArray(value));

  const normalizeProductColors = source.normalizeProductColors
    || props.normalizeProductColors
    || ProductsCore.normalizeProductColors
    || ((value) => toArray(value));

  const getProductGallery = source.getProductGallery
    || props.getProductGallery
    || ProductsCore.getProductGallery
    || ((product = {}) => {
      const gallery = toArray(product.images || product.gallery || product.photos).filter(Boolean);
      const primary = product.imageUrl || product.image || '';
      return primary && !gallery.includes(primary) ? [primary, ...gallery] : gallery;
    });

  return {
    ...source,
    productForm,
    setProductForm: source.setProductForm || props.setProductForm || noop,
    productImageFiles: toArray(source.productImageFiles ?? props.productImageFiles),
    productUploading: Boolean(source.productUploading ?? props.productUploading),
    editingProductId: source.editingProductId ?? props.editingProductId ?? null,
    controlProducts: toArray(source.controlProducts ?? props.controlProducts),
    PRODUCT_SIZE_OPTIONS: toArray(
      source.PRODUCT_SIZE_OPTIONS
      || props.PRODUCT_SIZE_OPTIONS
      || ProductsCore.PRODUCT_SIZE_OPTIONS
      || ['Chica', 'Mediana', 'Grande', 'XL']
    ),
    normalizeProductSizes,
    normalizeProductColors,
    getProductGallery,
    resetProductForm: source.resetProductForm || props.resetProductForm || noop,
    handleProductImagesSelect: source.handleProductImagesSelect || props.handleProductImagesSelect || noop,
    removeExistingProductImage: source.removeExistingProductImage || props.removeExistingProductImage || noop,
    removeNewProductImage: source.removeNewProductImage || props.removeNewProductImage || noop,
    replaceExistingProductImage: source.replaceExistingProductImage || props.replaceExistingProductImage || noop,
    handleProductSubmit: source.handleProductSubmit || props.handleProductSubmit || ((event) => event?.preventDefault?.()),
    editProduct: source.editProduct || props.editProduct || noop,
    toggleProduct: source.toggleProduct || props.toggleProduct || noop,
    deleteProduct: source.deleteProduct || props.deleteProduct || noop
  };
}

function BuiltInProductsAdminPanel({ manager, Icons = {} } = {}) {
  if (!h || !manager) return null;

  const TrashIcon = Icons.Trash || EmptyIcon;
  const Supermercado = globalThis.DriveMxSupermercado || globalThis.DriveMxSupermercadoCore || {};
  const {
    productForm,
    setProductForm,
    productImageFiles,
    productUploading,
    editingProductId,
    controlProducts,
    PRODUCT_SIZE_OPTIONS,
    normalizeProductSizes,
    getProductGallery,
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

  const existingImages = toArray(productForm.images);
  const pendingImages = toArray(productImageFiles);
  const selectedSizes = normalizeProductSizes(productForm.sizes);
  const colors = toArray(productForm.colors).length > 0 ? toArray(productForm.colors) : [''];

  return h('div', { className: 'card-glass overflow-hidden', id: 'admin-products-section' },
    h('div', { className: 'bg-slate-50 border-b border-slate-100 px-6 py-4 flex items-center justify-between gap-3' },
      h('div', null,
        h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400 drive-mx-panel-section-title' }, 'Administración de Productos'),
        h('p', { className: 'text-[9px] font-bold text-slate-300 uppercase mt-1' }, 'Administra únicamente tus publicaciones; las activas se muestran en la portada principal')
      ),
      editingProductId
        ? h('button', { type: 'button', onClick: resetProductForm, className: 'text-[9px] font-black text-slate-400 uppercase' }, 'Cancelar edición')
        : null
    ),
    h('div', { className: 'p-6 border-b border-slate-50' },
      h('form', { onSubmit: handleProductSubmit, className: 'grid md:grid-cols-5 gap-3' },
        h('label', { className: 'md:col-span-5 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-4 cursor-pointer hover:border-red-200 transition-all' },
          h('input', { type: 'file', accept: 'image/*', multiple: true, className: 'hidden', onChange: handleProductImagesSelect }),
          h('div', { className: 'flex items-center justify-between gap-4 flex-wrap' },
            h('div', null,
              h('p', { className: 'text-[10px] font-black uppercase text-slate-600' }, 'Fotografías del producto'),
              h('p', { className: 'text-[9px] font-bold text-slate-400 uppercase mt-1' }, 'Máximo 5 imágenes JPG, PNG o WebP asociadas al mismo ID')
            ),
            h('span', { className: 'px-3 py-2 bg-white rounded-xl text-[9px] font-black text-slate-400 uppercase' }, `${existingImages.length + pendingImages.length}/5 fotos`)
          )
        ),
        (existingImages.length > 0 || pendingImages.length > 0)
          ? h('div', { className: 'md:col-span-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3' },
              ...existingImages.map((image, index) => h('div', { key: `${image}-${index}`, className: 'relative rounded-2xl overflow-hidden bg-slate-100 border border-slate-100 group' },
                h('img', { src: image, alt: `Foto ${index + 1}`, className: 'w-full aspect-square object-cover' }),
                h('div', { className: 'absolute inset-x-2 bottom-2 flex gap-1' },
                  h('label', { className: 'flex-1 text-center bg-white/90 rounded-lg px-2 py-1 text-[7px] font-black uppercase cursor-pointer' },
                    'Reemplazar',
                    h('input', { type: 'file', accept: 'image/*', className: 'hidden', onChange: (event) => replaceExistingProductImage(index, event) })
                  ),
                  h('button', { type: 'button', onClick: () => removeExistingProductImage(index), className: 'flex-1 bg-red-500 text-white rounded-lg px-2 py-1 text-[7px] font-black uppercase' }, 'Eliminar')
                )
              )),
              ...pendingImages.map((item, index) => h('div', { key: item?.preview || `new-image-${index}`, className: 'relative rounded-2xl overflow-hidden bg-slate-100 border border-dashed border-red-200' },
                item?.preview ? h('img', { src: item.preview, alt: `Nueva foto ${index + 1}`, className: 'w-full aspect-square object-cover' }) : null,
                h('button', { type: 'button', onClick: () => removeNewProductImage(index), className: 'absolute inset-x-2 bottom-2 bg-red-500 text-white rounded-lg px-2 py-1 text-[7px] font-black uppercase' }, 'Quitar')
              ))
            )
          : null,
        Supermercado.ProductCategorySelect
          ? h(Supermercado.ProductCategorySelect, {
              value: productForm.category || '',
              onChange: (category) => setProductForm((previous = {}) => ({ ...previous, category }))
            })
          : null,
        h('input', {
          required: true,
          className: 'input-field md:col-span-2',
          placeholder: 'NOMBRE',
          value: productForm.name || '',
          onChange: (event) => setProductForm((previous = {}) => ({ ...previous, name: event.target.value }))
        }),
        h('input', {
          required: true,
          type: 'number',
          min: '0',
          step: '0.01',
          className: 'input-field',
          placeholder: 'PRECIO',
          value: productForm.price ?? '',
          onChange: (event) => setProductForm((previous = {}) => ({ ...previous, price: event.target.value }))
        }),
        h('input', {
          required: true,
          type: 'number',
          min: '0',
          step: '1',
          className: 'input-field',
          placeholder: 'INVENTARIO',
          value: productForm.stock ?? '',
          onChange: (event) => setProductForm((previous = {}) => ({ ...previous, stock: event.target.value }))
        }),
        h('label', { className: 'flex items-center gap-2 text-[10px] font-black uppercase text-slate-500 bg-slate-50 rounded-xl px-4 py-3' },
          h('input', {
            type: 'checkbox',
            checked: productForm.active !== false,
            onChange: (event) => setProductForm((previous = {}) => ({ ...previous, active: event.target.checked }))
          }),
          'Activo'
        ),
        h('div', { className: 'md:col-span-5 bg-slate-50 rounded-2xl p-4 space-y-3' },
          h('p', { className: 'text-[10px] font-black uppercase text-slate-600' }, 'Medidas opcionales'),
          h('div', { className: 'flex flex-wrap gap-2' },
            ...PRODUCT_SIZE_OPTIONS.map((size) => {
              const selected = selectedSizes.includes(size);
              return h('label', {
                key: size,
                className: `px-3 py-2 rounded-xl border text-[9px] font-black uppercase cursor-pointer ${selected ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white border-slate-100 text-slate-400'}`
              },
              h('input', {
                type: 'checkbox',
                className: 'hidden',
                checked: selected,
                onChange: (event) => setProductForm((previous = {}) => {
                  const currentSizes = normalizeProductSizes(previous.sizes);
                  return {
                    ...previous,
                    sizes: event.target.checked
                      ? Array.from(new Set([...currentSizes, size]))
                      : currentSizes.filter((item) => item !== size)
                  };
                })
              }),
              size);
            })
          )
        ),
        h('div', { className: 'md:col-span-5 bg-slate-50 rounded-2xl p-4 space-y-3' },
          h('div', { className: 'flex items-center justify-between gap-3' },
            h('p', { className: 'text-[10px] font-black uppercase text-slate-600' }, 'Colores opcionales'),
            h('button', {
              type: 'button',
              onClick: () => setProductForm((previous = {}) => ({ ...previous, colors: [...(toArray(previous.colors).length ? toArray(previous.colors) : ['']), ''] })),
              className: 'px-3 py-2 bg-white border border-slate-100 rounded-xl text-[10px] font-black text-red-500'
            }, '+')
          ),
          ...colors.map((color, index) => h('div', { key: index, className: 'flex gap-2' },
            h('input', {
              className: 'input-field',
              placeholder: 'COLOR',
              value: color || '',
              onChange: (event) => setProductForm((previous = {}) => {
                const nextColors = toArray(previous.colors).length ? [...toArray(previous.colors)] : [''];
                nextColors[index] = event.target.value;
                return { ...previous, colors: nextColors };
              })
            }),
            h('button', {
              type: 'button',
              onClick: () => setProductForm((previous = {}) => {
                const nextColors = (toArray(previous.colors).length ? toArray(previous.colors) : ['']).filter((_, colorIndex) => colorIndex !== index);
                return { ...previous, colors: nextColors.length ? nextColors : [''] };
              }),
              className: 'px-3 rounded-xl bg-white border border-slate-100 text-slate-400 font-black'
            }, '×')
          ))
        ),
        h('textarea', {
          className: 'input-field md:col-span-5 min-h-[90px] resize-y',
          placeholder: 'DESCRIPCIÓN',
          value: productForm.description || '',
          onChange: (event) => setProductForm((previous = {}) => ({ ...previous, description: event.target.value }))
        }),
        h('textarea', {
          className: 'input-field md:col-span-5 min-h-[90px] resize-y',
          placeholder: 'ESPECIFICACIONES',
          value: productForm.specifications || '',
          onChange: (event) => setProductForm((previous = {}) => ({ ...previous, specifications: event.target.value }))
        }),
        h('button', {
          disabled: productUploading,
          type: 'submit',
          className: 'md:col-span-5 btn-primary h-12 disabled:opacity-50 disabled:cursor-not-allowed'
        }, productUploading ? 'Guardando...' : (editingProductId ? 'Guardar Cambios' : 'Agregar Producto'))
      )
    ),
    h('div', { className: 'overflow-x-auto drive-mx-panel-table-wrap' },
      h('table', { className: 'w-full text-left' },
        h('thead', { className: 'bg-white border-b border-slate-50' },
          h('tr', { className: 'text-[8px] font-black uppercase text-slate-400' },
            h('th', { className: 'px-6 py-3' }, 'Foto'),
            h('th', { className: 'px-6 py-3' }, 'Producto'),
            h('th', { className: 'px-6 py-3' }, 'Precio'),
            h('th', { className: 'px-6 py-3' }, 'Inventario'),
            h('th', { className: 'px-6 py-3' }, 'Estado'),
            h('th', { className: 'px-6 py-3 text-right' }, 'Acciones')
          )
        ),
        h('tbody', { className: 'divide-y divide-slate-50' },
          ...controlProducts.map((product) => {
            const stock = Math.max(0, Math.floor(Number(product.stock ?? product.availableStock ?? 0)));
            const soldOut = stock <= 0;
            const statusLabel = soldOut ? 'Agotado' : (product.active !== false ? 'Activo' : 'Inactivo');
            const statusClass = soldOut
              ? 'bg-red-50 text-red-600'
              : (product.active !== false ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-400');
            const image = toArray(getProductGallery(product))[0] || '';

            return h('tr', { key: product.id, className: 'text-[10px] font-bold text-slate-600' },
              h('td', { className: 'px-6 py-4' },
                h('div', { className: 'w-12 h-12 rounded-xl bg-slate-100 overflow-hidden drive-mx-panel-product-thumb' },
                  image ? h('img', { src: image, alt: product.name || 'Producto', className: 'w-full h-full object-cover' }) : null
                )
              ),
              h('td', { className: 'px-6 py-4' },
                h('p', { className: 'font-black text-slate-800' }, product.name || 'Producto sin nombre'),
                h('p', { className: 'font-mono text-[8px] text-slate-400' }, product.id || '-')
              ),
              h('td', { className: 'px-6 py-4 text-red-600 font-black' }, `$${Number(product.price || 0).toFixed(2)}`),
              h('td', { className: 'px-6 py-4' }, stock),
              h('td', { className: 'px-6 py-4' },
                h('span', { className: `px-2 py-1 rounded-full text-[8px] uppercase ${statusClass}` }, statusLabel)
              ),
              h('td', { className: 'px-6 py-4 text-right' },
                h('div', { className: 'flex justify-end gap-2 flex-wrap' },
                  h('button', { type: 'button', onClick: () => editProduct(product), className: 'px-2 py-1 bg-slate-100 rounded-lg text-[8px] font-black uppercase' }, 'Editar'),
                  h('button', { type: 'button', onClick: () => toggleProduct(product), className: 'px-2 py-1 bg-slate-100 rounded-lg text-[8px] font-black uppercase' }, product.active !== false ? 'Desactivar' : 'Activar'),
                  h('button', { type: 'button', onClick: () => deleteProduct(product.id || product), className: 'text-slate-300 hover:text-red-500', 'aria-label': `Eliminar ${product.name || 'producto'}` }, h(TrashIcon, { size: 14 }))
                )
              )
            );
          }),
          controlProducts.length === 0
            ? h('tr', null,
                h('td', { colSpan: '6', className: 'px-6 py-8 text-center text-[10px] font-bold text-slate-300 uppercase' }, 'Aún no hay productos registrados')
              )
            : null
        )
      )
    )
  );
}

export function ProductsAdminPanel(props = {}) {
  if (!h) return null;

  const manager = resolveProductsAdminManager(props);
  const AdminProductsUI = globalThis.DriveMxAdminProducts || {};

  // En la versión modular se usa el componente de admin-products. Si dicho
  // archivo aún no está disponible, se mantiene la interfaz completa de
  // respaldo para que la sección nunca vuelva a desaparecer silenciosamente.
  if (props.manager && typeof AdminProductsUI.AdminProductsPanel === 'function') {
    return h(AdminProductsUI.AdminProductsPanel, {
      manager,
      Icons: props.Icons || {}
    });
  }

  return h(BuiltInProductsAdminPanel, {
    manager,
    Icons: props.Icons || {}
  });
}


