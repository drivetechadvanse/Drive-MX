(function (global) {
  'use strict';

  const React = global.React;
  if (!React) throw new Error('DriveMxPackagesGuides: React no está disponible.');

  const { useState, useEffect, useMemo, useCallback } = React;
  const NewShipment = global.DriveMxNewShipment || {};
  const ProductsCore = global.DriveMxProductsCore || {};
  const STEPS = ['Recolectado', 'Procesando', 'En Camino', 'Entregado'];
  const PACKAGES_COLLECTION = 'packages';
  const TRANSFERS_COLLECTION = 'bank_transfers';
  const OPERATORS_COLLECTION = 'operators';
  const ASSIGNMENTS_AUTH_LOCAL_PREFIX = 'driveMxAssignmentsAuthorization';

  const normalizeGuideCode = (value = '') => NewShipment.services?.normalizeGuideCode
    ? NewShipment.services.normalizeGuideCode(value)
    : String(value || '').toUpperCase().trim();

  const safeId = (value = '') => ProductsCore.safeDocumentId
    ? ProductsCore.safeDocumentId(value)
    : String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');

  const readLocal = (key, fallback = []) => ProductsCore.readLocal
    ? ProductsCore.readLocal(key, fallback)
    : (() => { try { return JSON.parse(global.localStorage.getItem(key) || 'null') ?? fallback; } catch (error) { return fallback; } })();

  const writeLocal = (key, value) => {
    if (ProductsCore.writeLocal) return ProductsCore.writeLocal(key, value);
    try { global.localStorage.setItem(key, JSON.stringify(value)); } catch (error) {}
  };

  const getUserId = (user = {}) => String(user.uid || user.id || '').trim();
  const getUserEmail = (user = {}) => String(user.email || '').trim().toLowerCase();

  const getAssignmentsAuthorizationStorageKey = (userId = '') => {
    const id = safeId(userId);
    return id ? `${ASSIGNMENTS_AUTH_LOCAL_PREFIX}_${id}` : '';
  };

  const readAssignmentsAuthorization = (userId = '') => {
    const key = getAssignmentsAuthorizationStorageKey(userId);
    if (!key) return false;
    try {
      return JSON.parse(global.localStorage.getItem(key) || '{}')?.authorized === true;
    } catch (error) {
      return false;
    }
  };

  const writeAssignmentsAuthorization = (userId = '', authorizedAt = Date.now()) => {
    const key = getAssignmentsAuthorizationStorageKey(userId);
    if (!key) return;
    try {
      global.localStorage.setItem(key, JSON.stringify({
        authorized: true,
        userId: String(userId || '').trim(),
        authorizedAt,
        updatedAt: Date.now()
      }));
    } catch (error) {}
  };

  const userHasAssignmentsAuthorization = (user = {}) => {
    const userId = getUserId(user);
    return Boolean(
      user.assignmentsAuthorized === true
      || user.assignmentsAccessAuthorized === true
      || user.misAsignacionesAutorizadas === true
      || readAssignmentsAuthorization(userId)
    );
  };

  const sortPackages = (items = []) => [...items].sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0));

  const buildPackageFromOrder = ({ transfer = {}, trackingCode = '', shippingFee = 150 } = {}) => {
    const order = transfer.order || {};
    const orderProducts = Array.isArray(order.products) && order.products.length > 0
      ? order.products
      : (order.product ? [order.product] : []);
    const product = orderProducts[0] || {};
    const delivery = order.delivery || {};
    const address = [delivery.street, delivery.neighborhood, delivery.municipality, delivery.state, delivery.zip].filter(Boolean).join(', ');
    const lineTotal = (item = {}) => {
      const quantity = Math.max(1, Math.floor(Number(item.quantity || item.productQuantity || 1)) || 1);
      const unitPrice = Number(item.unitPrice ?? item.productUnitPrice ?? item.price ?? 0);
      return Number(item.lineTotal ?? item.totalPrice ?? item.productTotal ?? item.productCost ?? (unitPrice * quantity) ?? 0);
    };
    const normalizedCode = normalizeGuideCode(trackingCode);
    const now = Date.now();

    return {
      id: normalizedCode,
      trackingNumber: normalizedCode,
      orderId: transfer.id || transfer.transferId || '',
      transferId: transfer.id || transfer.transferId || '',
      productId: orderProducts.map((item) => item.id).filter(Boolean).join(', ') || product.id || '',
      product: { ...product },
      products: orderProducts.map((item) => ({ ...item })),
      orderTotal: Number(order.cart?.total ?? (orderProducts.reduce((total, item) => total + lineTotal(item), 0) + (orderProducts.length > 0 ? shippingFee : 0))),
      shippingFee: Number(order.cart?.shippingFee ?? (orderProducts.length > 0 ? shippingFee : 0)),
      customer: {
        fullName: delivery.fullName || transfer.holderName || '',
        phone: delivery.phone || '',
        email: delivery.email || ''
      },
      delivery: { ...delivery },
      o: 'DRIVE MX',
      d: address || 'Dirección registrada',
      op: '',
      status: 'Recolectado',
      currentStep: 0,
      createdAt: now,
      updatedAt: now
    };
  };

  function usePackagesGuidesManager({
    fbase,
    appId,
    fbUser,
    sessionUser,
    users = [],
    products = [],
    controlProducts = [],
    shippingFee = 150,
    ensureAccountAllowed = () => true,
    verifyAdminPassword = async () => false,
    onSessionProfileChange = () => {},
    activeView = 'home'
  } = {}) {
    const sessionUserId = getUserId(sessionUser || {});
    const cacheKey = sessionUser?.role === 'admin'
      ? 'driveMxPackages_admin'
      : (sessionUserId ? `driveMxPackages_${safeId(sessionUserId)}` : 'driveMxPackages_anonymous');
    const [pkgs, setPkgs] = useState([]);
    const [transferTrackingDrafts, setTransferTrackingDrafts] = useState({});
    const [trackingResult, setTrackingResult] = useState(null);
    const [trackingNotFound, setTrackingNotFound] = useState(false);
    const [assignmentsUnlocked, setAssignmentsUnlocked] = useState(false);
    const [showAssignmentsPasswordModal, setShowAssignmentsPasswordModal] = useState(false);
    const [assignmentsPassword, setAssignmentsPassword] = useState('');
    const [assignmentsPasswordError, setAssignmentsPasswordError] = useState('');
    const [assignmentsUnlocking, setAssignmentsUnlocking] = useState(false);

    const replacePackages = useCallback((nextValue) => {
      setPkgs((previous) => {
        const resolved = typeof nextValue === 'function' ? nextValue(previous) : nextValue;
        const normalized = sortPackages(Array.isArray(resolved) ? resolved : []);
        writeLocal(cacheKey, normalized);
        return normalized;
      });
    }, [cacheKey]);

    useEffect(() => {
      if (!fbUser || !sessionUser) {
        setPkgs([]);
        return undefined;
      }
      const cached = readLocal(cacheKey, []);
      setPkgs(Array.isArray(cached) ? sortPackages(cached) : []);
      const db = fbase.getFirestore();
      const packagesRef = fbase.collection(db, 'artifacts', appId, 'public', 'data', PACKAGES_COLLECTION);
      let packagesQuery = packagesRef;
      if (sessionUser.role !== 'admin') {
        if (!sessionUserId) {
          setPkgs([]);
          return undefined;
        }
        packagesQuery = fbase.query(packagesRef, fbase.where('op', '==', sessionUserId));
      }
      const unsubscribe = fbase.onSnapshot(packagesQuery, (snapshot) => {
        const next = [];
        snapshot.forEach((documentSnapshot) => next.push({ id: documentSnapshot.id, ...documentSnapshot.data() }));
        const sorted = sortPackages(next);
        setPkgs(sorted);
        writeLocal(cacheKey, sorted);
      }, (error) => console.error('Firestore paquetes y guías:', error));
      return () => unsubscribe?.();
    }, [fbUser, fbase, appId, sessionUser?.role, sessionUserId, cacheKey]);

    useEffect(() => {
      if (!sessionUser || sessionUser.role === 'admin') {
        setAssignmentsUnlocked(false);
        return;
      }
      setAssignmentsUnlocked(userHasAssignmentsAuthorization(sessionUser));
    }, [sessionUser?.uid, sessionUser?.id, sessionUser?.assignmentsAuthorized, sessionUser?.assignmentsAccessAuthorized, sessionUser?.misAsignacionesAutorizadas, sessionUser?.role]);

    useEffect(() => {
      if (activeView === 'operator') return;
      setShowAssignmentsPasswordModal(false);
      setAssignmentsPassword('');
      setAssignmentsPasswordError('');
      setAssignmentsUnlocking(false);
      if (activeView !== 'guide-assignment') setAssignmentsUnlocked(false);
    }, [activeView]);

    const onShipmentCreated = useCallback((shipment = {}) => {
      if (!shipment?.id) return;
      replacePackages((previous) => [shipment, ...previous.filter((item) => String(item.id) !== String(shipment.id))]);
    }, [replacePackages]);

    const deletePackage = useCallback(async (packageOrId) => {
      if (sessionUser?.role !== 'admin') return;
      const id = normalizeGuideCode(typeof packageOrId === 'object' ? (packageOrId.id || packageOrId.trackingNumber) : packageOrId);
      if (!id || !global.confirm(`¿Eliminar la guía ${id}?`)) return;
      const previous = pkgs.find((item) => String(item.id) === id) || null;
      replacePackages((items) => items.filter((item) => String(item.id) !== id));
      try {
        await NewShipment.services.deleteAdminShipmentWithTracking({ fbase, appId, guideCode: id });
      } catch (error) {
        console.error('Eliminar paquete y guía:', error);
        if (previous) onShipmentCreated(previous);
        alert('No se pudo eliminar la guía.');
      }
    }, [sessionUser?.role, pkgs, replacePackages, fbase, appId, onShipmentCreated]);

    const findProductByTracking = useCallback((tracking = {}) => {
      const orderProducts = Array.isArray(tracking.order?.products) ? tracking.order.products : [];
      const productId = tracking.productId || tracking.products?.[0]?.id || orderProducts[0]?.id || tracking.product?.id || tracking.order?.product?.id || '';
      return (Array.isArray(products) ? products : []).find((product) => String(product.id) === String(productId))
        || tracking.products?.[0]
        || orderProducts[0]
        || tracking.product
        || tracking.order?.product
        || null;
    }, [products]);

    const findAssignedUser = useCallback((shipment = {}) => {
      const assignedUserId = String(shipment.assignedUserId || shipment.op || '').trim();
      if (!assignedUserId) return null;
      return (Array.isArray(users) ? users : []).find((user) => getUserId(user) === assignedUserId) || null;
    }, [users]);

    const getAssignedUserName = useCallback((shipment = {}) => {
      const assignedUser = findAssignedUser(shipment);
      return String(
        shipment.assignedUserName
        || shipment.driverName
        || assignedUser?.name
        || assignedUser?.email
        || shipment.assignedUserId
        || shipment.op
        || ''
      ).trim();
    }, [findAssignedUser]);

    const assignTrackingToTransfer = useCallback(async (transfer = {}) => {
      if (sessionUser?.role !== 'admin') return;
      const transferId = String(transfer.id || transfer.transferId || '').trim();
      const code = normalizeGuideCode(transferTrackingDrafts[transferId] || transfer.trackingNumber || '');
      if (!transferId) { alert('No se encontró la transferencia.'); return; }
      if (!code) { alert('Ingresa el número de guía.'); return; }

      const shipment = buildPackageFromOrder({ transfer, trackingCode: code, shippingFee });
      const db = fbase.getFirestore();
      const packageRef = fbase.doc(db, 'artifacts', appId, 'public', 'data', PACKAGES_COLLECTION, code);
      const transferRef = fbase.doc(db, 'artifacts', appId, 'public', 'data', TRANSFERS_COLLECTION, transferId);
      const transferPatch = {
        trackingNumber: code,
        packageId: code,
        updatedAt: Date.now(),
        trackingAssignedAt: Date.now(),
        trackingAssignedBy: sessionUser.email || ''
      };

      try {
        await fbase.setDoc(packageRef, shipment, { merge: true });
        await NewShipment.services.upsertTrackingGuide({ fbase, appId, shipment });
        await fbase.setDoc(transferRef, transferPatch, { merge: true });
        onShipmentCreated(shipment);
        setTransferTrackingDrafts((previous) => ({ ...previous, [transferId]: '' }));
        alert('Guía asociada al pedido y producto correctamente.');
      } catch (error) {
        console.error('Asociar guía a transferencia:', error);
        alert('No se pudo asociar la guía al pedido.');
      }
    }, [sessionUser, transferTrackingDrafts, shippingFee, fbase, appId, onShipmentCreated]);

    const runTrackingSearch = useCallback((value, notify = false) => {
      const productId = normalizeGuideCode(value);
      if (!productId) {
        setTrackingResult(null);
        setTrackingNotFound(false);
        return null;
      }
      const found = (Array.isArray(controlProducts) ? controlProducts : []).find((product) => normalizeGuideCode(product.id) === productId) || null;
      setTrackingResult(found);
      setTrackingNotFound(!found);
      if (!found && notify) alert('No se encontró el producto');
      return found;
    }, [controlProducts]);

    const resetTracking = useCallback(() => {
      setTrackingResult(null);
      setTrackingNotFound(false);
    }, []);

    const persistAssignmentsAuthorization = useCallback(async () => {
      if (!sessionUserId || !sessionUser || sessionUser.role === 'admin') return false;
      const now = Date.now();
      const authorizedAt = sessionUser.assignmentsAuthorizedAt || now;
      const patch = {
        assignmentsAuthorized: true,
        assignmentsAuthorizedAt: authorizedAt,
        assignmentsAuthorizationUpdatedAt: now,
        updatedAt: now,
        updatedBy: 'admin@drivemx.com'
      };
      writeAssignmentsAuthorization(sessionUserId, authorizedAt);
      const operatorRef = fbase.doc(fbase.getFirestore(), 'artifacts', appId, 'public', 'data', OPERATORS_COLLECTION, sessionUserId);
      await fbase.setDoc(operatorRef, patch, { merge: true });
      onSessionProfileChange({ ...(sessionUser || {}), ...patch, id: sessionUser.id || sessionUserId, uid: sessionUser.uid || sessionUserId });
      return true;
    }, [sessionUserId, sessionUser, fbase, appId, onSessionProfileChange]);

    const closeAssignmentsPasswordModal = useCallback(() => {
      if (assignmentsUnlocking) return;
      setShowAssignmentsPasswordModal(false);
      setAssignmentsPassword('');
      setAssignmentsPasswordError('');
    }, [assignmentsUnlocking]);

    const openAssignmentsAccess = useCallback(() => {
      if (!ensureAccountAllowed()) return;
      setAssignmentsPassword('');
      setAssignmentsPasswordError('');
      if (assignmentsUnlocked || userHasAssignmentsAuthorization(sessionUser || {})) {
        setAssignmentsUnlocked(true);
        return;
      }
      setShowAssignmentsPasswordModal(true);
    }, [ensureAccountAllowed, assignmentsUnlocked, sessionUser]);

    const validateAssignmentsPassword = useCallback(async (event) => {
      event?.preventDefault?.();
      if (!ensureAccountAllowed()) {
        setAssignmentsPassword('');
        return;
      }
      if (!assignmentsPassword) {
        setAssignmentsPasswordError('Ingresa la contraseña maestra.');
        return;
      }
      setAssignmentsUnlocking(true);
      setAssignmentsPasswordError('');
      try {
        await verifyAdminPassword(assignmentsPassword);
        await persistAssignmentsAuthorization();
        setAssignmentsUnlocked(true);
        setShowAssignmentsPasswordModal(false);
        setAssignmentsPassword('');
      } catch (error) {
        console.error('Validar contraseña maestra de asignaciones:', error);
        setAssignmentsUnlocked(false);
        setAssignmentsPassword('');
        setAssignmentsPasswordError('Acceso denegado. Contraseña incorrecta.');
      } finally {
        setAssignmentsUnlocking(false);
      }
    }, [ensureAccountAllowed, assignmentsPassword, verifyAdminPassword, persistAssignmentsAuthorization]);

    const updateAssignedPackageStatus = useCallback(async (pkg, status, currentStep) => {
      if (!ensureAccountAllowed()) return;
      if (!assignmentsUnlocked && !userHasAssignmentsAuthorization(sessionUser || {})) {
        alert('Valida primero la contraseña maestra para acceder a Mis Asignaciones.');
        return;
      }
      try {
        const updatedPackage = await NewShipment.services.updateAdminShipmentWithTracking({
          fbase,
          appId,
          shipment: pkg,
          patch: {
            status,
            currentStep,
            updatedBy: sessionUser?.email || '',
            updatedByUid: sessionUserId
          }
        });
        replacePackages((previous) => previous.map((item) => String(item.id) === String(updatedPackage.id) ? updatedPackage : item));
      } catch (error) {
        console.error('Actualizar estado de asignación:', error);
        alert('No se pudo actualizar el estado de la guía.');
      }
    }, [ensureAccountAllowed, assignmentsUnlocked, sessionUser, sessionUserId, fbase, appId, replacePackages]);

    const assignedPackages = useMemo(() => pkgs.filter((pkg) => String(pkg.op || pkg.assignedUserId || '') === sessionUserId), [pkgs, sessionUserId]);

    const reset = useCallback(() => {
      setPkgs([]);
      setTransferTrackingDrafts({});
      resetTracking();
      setAssignmentsUnlocked(false);
      setShowAssignmentsPasswordModal(false);
      setAssignmentsPassword('');
      setAssignmentsPasswordError('');
      setAssignmentsUnlocking(false);
    }, [resetTracking]);

    return {
      pkgs,
      assignedPackages,
      transferTrackingDrafts,
      setTransferTrackingDrafts,
      trackingResult,
      trackingNotFound,
      runTrackingSearch,
      resetTracking,
      onShipmentCreated,
      deletePackage,
      findProductByTracking,
      findAssignedUser,
      getAssignedUserName,
      assignTrackingToTransfer,
      assignmentsUnlocked,
      setAssignmentsUnlocked,
      showAssignmentsPasswordModal,
      setShowAssignmentsPasswordModal,
      assignmentsPassword,
      setAssignmentsPassword,
      assignmentsPasswordError,
      setAssignmentsPasswordError,
      assignmentsUnlocking,
      setAssignmentsUnlocking,
      openAssignmentsAccess,
      closeAssignmentsPasswordModal,
      validateAssignmentsPassword,
      updateAssignedPackageStatus,
      userHasAssignmentsAuthorization,
      reset
    };
  }

  function AdminShipmentsCard({ manager, Icons = {} } = {}) {
    if (!manager) return null;
    const TrashIcon = Icons.Trash || (() => null);
    return (
      <div className="card-glass overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-100 px-6 py-4">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 drive-mx-panel-section-title">Envíos Activos</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <tbody className="divide-y divide-slate-50">
              {manager.pkgs.map((pkg) => {
                const assignedUserName = manager.getAssignedUserName?.(pkg) || 'Sin usuario asignado';
                return (
                  <tr key={pkg.id} className="text-[10px] font-bold text-slate-600">
                    <td className="px-6 py-4 text-red-600 font-black">#{pkg.id}</td>
                    <td className="px-6 py-4">
                      {pkg.o} → {pkg.d}<br />
                      <span className="text-[8px] text-slate-500 uppercase">{pkg.fullName || pkg.customer?.fullName || 'Nombre no registrado'}</span>
                      <span className="text-[8px] text-slate-400"> · {pkg.phone || pkg.customer?.phone || 'Teléfono no registrado'}</span><br />
                      <span className="text-[8px] text-slate-400 uppercase">Código postal: {pkg.zip || pkg.delivery?.zip || 'No registrado'}</span><br />
                      <span className="text-[8px] text-slate-400 uppercase break-words">Referencias: {pkg.references || pkg.delivery?.references || 'No registradas'}</span><br />
                      <span className="text-[8px] text-red-500 font-black uppercase">Usuario asignado: {assignedUserName}</span><br />
                      <span className="text-[8px] text-slate-400 uppercase">{manager.findProductByTracking(pkg)?.name || pkg.productId || 'Sin producto'}</span>
                    </td>
                    <td className="px-6 py-4"><span className="px-2 py-1 bg-slate-100 rounded-full text-[8px] uppercase">{pkg.status}</span></td>
                    <td className="px-6 py-4 text-right"><button type="button" onClick={() => manager.deletePackage(pkg)} className="text-slate-300 hover:text-red-500"><TrashIcon /></button></td>
                  </tr>
                );
              })}
              {manager.pkgs.length === 0 && <tr><td colSpan="4" className="px-6 py-8 text-center text-[10px] font-bold text-slate-300 uppercase">No hay envíos activos</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function UserAssignmentsPanel({ manager, Icons = {} } = {}) {
    if (!manager) return null;
    const MenuIcon = Icons.Menu || (() => null);
    if (!manager.assignmentsUnlocked) {
      return (
        <div className="card-glass p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto"><MenuIcon size={22} /></div>
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight">Asignaciones protegidas</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase mt-2 leading-relaxed">Abre el menú hamburguesa y selecciona Mis Asignaciones para validar la contraseña maestra.</p>
          </div>
        </div>
      );
    }

    return (
      <>
        <div><h1 className="text-3xl font-black uppercase tracking-tight">Mis <span className="text-red-500">Asignaciones</span></h1><p className="text-[10px] font-bold text-slate-400 uppercase">Ruta Activa</p></div>
        <div className="space-y-4">
          {manager.assignedPackages.map((pkg) => {
            const customer = pkg.customer || {};
            return (
              <div key={pkg.id} className="card-glass p-6 space-y-6">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                  <div>
                    <p className="text-[8px] font-black uppercase text-slate-400">Número de guía</p>
                    <h3 className="text-xl font-black text-red-600">#{pkg.id}</h3>
                  </div>
                  <span className="text-[9px] font-black uppercase text-slate-400">{pkg.status || 'Recolectado'}</span>
                </div>
                <div className="grid sm:grid-cols-2 gap-3 bg-slate-50 rounded-2xl p-4">
                  <div><p className="text-[8px] font-black text-slate-400 uppercase">Nombre completo</p><p className="text-sm font-black text-slate-800 uppercase break-anywhere">{pkg.fullName || customer.fullName || '-'}</p></div>
                  <div><p className="text-[8px] font-black text-slate-400 uppercase">Número de teléfono</p><p className="text-sm font-black text-slate-800 break-anywhere">{pkg.phone || customer.phone || '-'}</p></div>
                  <div><p className="text-[8px] font-black text-slate-400 uppercase">Origen</p><p className="text-sm font-black text-slate-800 uppercase break-anywhere">{pkg.o || '-'}</p></div>
                  <div><p className="text-[8px] font-black text-slate-400 uppercase">Destino</p><p className="text-sm font-black text-slate-800 uppercase break-anywhere">{pkg.d || '-'}</p></div>
                  <div><p className="text-[8px] font-black text-slate-400 uppercase">Código postal</p><p className="text-sm font-black text-slate-800 break-anywhere">{pkg.zip || pkg.delivery?.zip || '-'}</p></div>
                  <div className="sm:col-span-2"><p className="text-[8px] font-black text-slate-400 uppercase">Referencias del domicilio</p><p className="text-sm font-black text-slate-800 uppercase break-anywhere">{pkg.references || pkg.delivery?.references || '-'}</p></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {STEPS.map((step, index) => (
                    <button key={step} type="button" onClick={() => manager.updateAssignedPackageStatus(pkg, step, index)} className={`p-3 rounded-xl text-[9px] font-black uppercase border-2 transition-all ${pkg.status === step ? 'bg-red-500 border-red-500 text-white shadow-lg' : 'border-slate-100 text-slate-400'}`}>{step === 'Procesando' ? 'Procesado' : step}</button>
                  ))}
                </div>
              </div>
            );
          })}
          {manager.assignedPackages.length === 0 && <div className="card-glass p-8 text-center text-[10px] font-black uppercase text-slate-300">No tienes guías asignadas</div>}
        </div>
      </>
    );
  }

  function AssignmentsPasswordModal({ manager } = {}) {
    if (!manager?.showAssignmentsPasswordModal) return null;
    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
        <div className="card-glass max-w-sm w-full p-10 animate-slide">
          <h2 className="text-sm font-black text-center uppercase mb-2">Acceso Protegido</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase text-center mb-8 leading-relaxed">Ingresa la contraseña maestra del administrador central para abrir Mis Asignaciones. Al validarse, solo se guarda la autorización del usuario; la contraseña no se almacena.</p>
          <form onSubmit={manager.validateAssignmentsPassword} className="space-y-4">
            <input required autoFocus type="password" className="input-field" placeholder="CONTRASEÑA MAESTRA" value={manager.assignmentsPassword} onChange={(event) => { manager.setAssignmentsPassword(event.target.value); manager.setAssignmentsPasswordError(''); }} />
            {manager.assignmentsPasswordError && <p className="text-center text-[10px] font-black text-red-500 uppercase tracking-widest">{manager.assignmentsPasswordError}</p>}
            <button disabled={manager.assignmentsUnlocking} type="submit" className="w-full btn-primary h-12 disabled:opacity-50 disabled:cursor-not-allowed">{manager.assignmentsUnlocking ? 'Validando...' : 'Validar acceso'}</button>
            <button disabled={manager.assignmentsUnlocking} type="button" onClick={manager.closeAssignmentsPasswordModal} className="w-full text-[9px] font-black text-slate-400 uppercase disabled:opacity-50">Cancelar</button>
          </form>
        </div>
      </div>
    );
  }

  global.DriveMxPackagesGuides = {
    STEPS,
    usePackagesGuidesManager,
    AdminShipmentsCard,
    UserAssignmentsPanel,
    AssignmentsPasswordModal,
    services: {
      normalizeGuideCode,
      buildPackageFromOrder,
      getAssignmentsAuthorizationStorageKey,
      readAssignmentsAuthorization,
      writeAssignmentsAuthorization,
      userHasAssignmentsAuthorization
    }
  };
})(window);



