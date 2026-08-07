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

// Compatibilidad con la interfaz anterior de PanelControl. El CRUD, imágenes,
// inventario y formulario completo viven en admin-products/admin-products.js.
export function ProductsAdminPanel(props = {}) {
  if (!h) return null;
  const AdminProductsUI = globalThis.DriveMxAdminProducts || {};
  if (typeof AdminProductsUI.AdminProductsPanel !== 'function') return null;
  const manager = props.manager || {
    productForm: props.productForm,
    setProductForm: props.setProductForm,
    productImageFiles: props.productImageFiles,
    productUploading: props.productUploading,
    editingProductId: props.editingProductId,
    controlProducts: toArray(props.controlProducts),
    resetProductForm: props.resetProductForm,
    handleProductImagesSelect: props.handleProductImagesSelect,
    removeExistingProductImage: props.removeExistingProductImage,
    removeNewProductImage: props.removeNewProductImage,
    replaceExistingProductImage: props.replaceExistingProductImage,
    handleProductSubmit: props.handleProductSubmit,
    editProduct: props.editProduct,
    toggleProduct: props.toggleProduct,
    deleteProduct: props.deleteProduct
  };
  return h(AdminProductsUI.AdminProductsPanel, { manager, Icons: props.Icons || {} });
}

