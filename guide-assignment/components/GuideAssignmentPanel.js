import { NewShipmentForm } from '../../new-shipment/components/NewShipmentForm.js';
import {
  createEmptyShipmentForm,
  validateShipmentForm
} from '../../new-shipment/services/newShipmentService.js';
import {
  createUserShipment,
  deleteUserShipment,
  subscribeUserShipments,
  updateUserShipment
} from '../services/guideAssignmentService.js';

const h = globalThis.React?.createElement;
const useEffect = globalThis.React?.useEffect;
const useState = globalThis.React?.useState;
const DEFAULT_STEPS = ['Recolectado', 'Procesando', 'En Camino', 'Entregado'];
const EmptyIcon = () => null;

function EditShipmentForm(props = {}) {
  if (!h) return null;
  const form = props.form || {};
  const setForm = props.setForm || (() => {});
  return h('form', { onSubmit: props.onSubmit, className: 'grid sm:grid-cols-2 gap-3 pt-4 border-t border-slate-100' },
    h('input', { required: true, className: 'input-field uppercase', placeholder: 'NOMBRE COMPLETO', value: form.fullName || '', onChange: (event) => setForm({ ...form, fullName: event.target.value }) }),
    h('input', { required: true, type: 'tel', className: 'input-field', placeholder: 'NÚMERO DE TELÉFONO', value: form.phone || '', onChange: (event) => setForm({ ...form, phone: event.target.value }) }),
    h('input', { required: true, className: 'input-field uppercase', placeholder: 'ORIGEN', value: form.o || '', onChange: (event) => setForm({ ...form, o: event.target.value }) }),
    h('input', { required: true, className: 'input-field uppercase', placeholder: 'DESTINO', value: form.d || '', onChange: (event) => setForm({ ...form, d: event.target.value }) }),
    props.errorMessage ? h('p', { className: 'sm:col-span-2 text-[9px] font-black text-red-500 uppercase text-center' }, props.errorMessage) : null,
    h('div', { className: 'sm:col-span-2 flex flex-col sm:flex-row gap-2' },
      h('button', { type: 'submit', disabled: props.saving, className: 'btn-primary flex-1 h-11 disabled:opacity-50' }, props.saving ? 'Guardando...' : 'Guardar cambios'),
      h('button', { type: 'button', disabled: props.saving, onClick: props.onCancel, className: 'px-4 h-11 rounded-xl bg-slate-100 text-[9px] font-black uppercase text-slate-500 disabled:opacity-50' }, 'Cancelar')
    )
  );
}

export function GuideAssignmentPanel(props = {}) {
  if (!h || !useEffect || !useState) return null;
  const Icons = props.Icons || {};
  const TrashIcon = Icons.Trash || EmptyIcon;
  const steps = Array.isArray(props.steps) && props.steps.length ? props.steps : DEFAULT_STEPS;
  const [shipments, setShipments] = useState([]);
  const [form, setForm] = useState(() => createEmptyShipmentForm());
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [lastGuide, setLastGuide] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editForm, setEditForm] = useState(() => createEmptyShipmentForm());
  const [editError, setEditError] = useState('');
  const [processingId, setProcessingId] = useState('');

  useEffect(() => {
    setLoading(true);
    setLoadError('');
    const unsubscribe = subscribeUserShipments({
      fbase: props.fbase,
      appId: props.appId,
      user: props.currentUser,
      onChange: (items) => {
        setShipments(items);
        setLoading(false);
      },
      onError: () => {
        setLoadError('No se pudieron cargar las asignaciones.');
        setLoading(false);
      }
    });
    return () => unsubscribe?.();
  }, [props.fbase, props.appId, props.currentUser?.uid, props.currentUser?.id]);

  const handleCreate = async (event) => {
    event.preventDefault();
    if (creating || props.ensureAccountAllowed?.() === false) return;
    setCreating(true);
    setCreateError('');
    setLastGuide('');
    try {
      const shipment = await createUserShipment({
        fbase: props.fbase,
        appId: props.appId,
        form,
        user: props.currentUser
      });
      setForm(createEmptyShipmentForm());
      setLastGuide(shipment.id);
    } catch (error) {
      console.error('Crear guía de usuario:', error);
      setCreateError(error?.message || 'No se pudo crear la guía.');
    } finally {
      setCreating(false);
    }
  };

  const beginEdit = (shipment) => {
    setEditingId(shipment.id);
    setEditError('');
    setEditForm(createEmptyShipmentForm({
      fullName: shipment.fullName || shipment.customer?.fullName || '',
      phone: shipment.phone || shipment.customer?.phone || '',
      o: shipment.o || '',
      d: shipment.d || ''
    }));
  };

  const saveEdit = async (event, shipment) => {
    event.preventDefault();
    if (processingId || props.ensureAccountAllowed?.() === false) return;
    const validation = validateShipmentForm({ ...editForm, op: props.currentUser?.uid || props.currentUser?.id || '' });
    if (!validation.valid) {
      setEditError(validation.message);
      return;
    }
    setProcessingId(shipment.id);
    setEditError('');
    try {
      await updateUserShipment({
        fbase: props.fbase,
        appId: props.appId,
        user: props.currentUser,
        shipment,
        patch: validation.data
      });
      setEditingId('');
      setEditForm(createEmptyShipmentForm());
    } catch (error) {
      console.error('Modificar guía de usuario:', error);
      setEditError(error?.message || 'No se pudo modificar la guía.');
    } finally {
      setProcessingId('');
    }
  };

  const changeStatus = async (shipment, status, currentStep) => {
    if (processingId || props.ensureAccountAllowed?.() === false) return;
    setProcessingId(shipment.id);
    try {
      await updateUserShipment({
        fbase: props.fbase,
        appId: props.appId,
        user: props.currentUser,
        shipment,
        patch: { status, currentStep }
      });
    } catch (error) {
      console.error('Actualizar estado de guía:', error);
      alert(error?.message || 'No se pudo actualizar el estado.');
    } finally {
      setProcessingId('');
    }
  };

  const removeShipment = async (shipment) => {
    if (processingId || props.ensureAccountAllowed?.() === false) return;
    if (!window.confirm(`¿Eliminar la guía ${shipment.id}?`)) return;
    setProcessingId(shipment.id);
    try {
      await deleteUserShipment({
        fbase: props.fbase,
        appId: props.appId,
        user: props.currentUser,
        guideCode: shipment.id
      });
      if (editingId === shipment.id) setEditingId('');
    } catch (error) {
      console.error('Eliminar guía de usuario:', error);
      alert(error?.message || 'No se pudo eliminar la guía.');
    } finally {
      setProcessingId('');
    }
  };

  return h('div', { className: 'w-full max-w-5xl py-6 space-y-8 animate-slide' },
    h('div', { className: 'flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4' },
      h('div', null,
        h('p', { className: 'text-[10px] font-bold text-slate-400 uppercase' }, 'Panel de Usuario Registrado'),
        h('h1', { className: 'text-3xl font-black uppercase tracking-tight' }, 'Asignación de ', h('span', { className: 'text-red-500' }, 'Guías')),
        h('p', { className: 'text-[9px] font-bold text-slate-400 uppercase mt-1' }, 'Tus registros permanecen separados del Panel Admin')
      ),
      h('button', { type: 'button', onClick: props.onBack, className: 'px-4 h-11 rounded-xl bg-white border border-slate-200 text-[9px] font-black uppercase text-slate-500 hover:text-red-500' }, 'Volver al Panel de Usuario')
    ),

    h('div', { className: 'grid lg:grid-cols-3 gap-8 items-start' },
      h('section', { className: 'card-glass p-6 space-y-6 lg:sticky lg:top-24' },
        h('div', null,
          h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400' }, 'Nuevo Envío'),
          h('p', { className: 'text-[8px] font-bold text-slate-300 uppercase mt-1' }, 'El número de guía se genera automáticamente')
        ),
        h(NewShipmentForm, {
          form,
          setForm,
          showUserSelect: false,
          submitting: creating,
          errorMessage: createError,
          onSubmit: handleCreate,
          submitLabel: 'Crear Guía'
        }),
        lastGuide ? h('div', { className: 'rounded-2xl bg-green-50 border border-green-100 p-4 text-center' },
          h('p', { className: 'text-[8px] font-black text-green-600 uppercase tracking-widest' }, 'Guía creada correctamente'),
          h('p', { className: 'text-xl font-black text-green-700 mt-1' }, lastGuide)
        ) : null
      ),

      h('section', { className: 'lg:col-span-2 space-y-4' },
        h('div', { className: 'flex items-center justify-between gap-4' },
          h('div', null,
            h('h2', { className: 'text-xl font-black uppercase tracking-tight' }, 'Guías asignadas'),
            h('p', { className: 'text-[9px] font-bold text-slate-400 uppercase' }, 'Visualiza, modifica y administra tus registros')
          ),
          h('span', { className: 'px-3 py-2 rounded-full bg-slate-100 text-[9px] font-black text-slate-500 uppercase' }, `${shipments.length} registro${shipments.length === 1 ? '' : 's'}`)
        ),
        loading ? h('div', { className: 'card-glass p-8 text-center text-[10px] font-black text-slate-300 uppercase' }, 'Cargando asignaciones...') : null,
        loadError ? h('div', { className: 'card-glass p-8 text-center text-[10px] font-black text-red-500 uppercase' }, loadError) : null,
        !loading && !loadError && shipments.length === 0 ? h('div', { className: 'card-glass p-8 text-center' },
          h('p', { className: 'text-[10px] font-black text-slate-300 uppercase tracking-widest' }, 'Aún no tienes guías registradas')
        ) : null,
        shipments.map((shipment) => {
          const customer = shipment.customer || {};
          const busy = processingId === shipment.id;
          return h('article', { key: shipment.id, className: 'card-glass p-6 space-y-5' },
            h('div', { className: 'flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3' },
              h('div', null,
                h('p', { className: 'text-[8px] font-black text-slate-400 uppercase' }, 'Número de guía'),
                h('h3', { className: 'text-2xl font-black text-red-600' }, `#${shipment.id}`)
              ),
              h('div', { className: 'flex items-center gap-2' },
                h('button', { type: 'button', disabled: busy, onClick: () => beginEdit(shipment), className: 'px-3 py-2 bg-slate-100 rounded-xl text-[8px] font-black uppercase text-slate-600 disabled:opacity-50' }, 'Editar'),
                h('button', { type: 'button', disabled: busy, onClick: () => removeShipment(shipment), className: 'w-9 h-9 flex items-center justify-center text-slate-300 hover:text-red-500 disabled:opacity-50', 'aria-label': `Eliminar guía ${shipment.id}` }, h(TrashIcon))
              )
            ),
            h('div', { className: 'grid sm:grid-cols-2 gap-3 bg-slate-50 rounded-2xl p-4' },
              h('div', null, h('p', { className: 'text-[8px] font-black text-slate-400 uppercase' }, 'Nombre completo'), h('p', { className: 'text-sm font-black text-slate-800 uppercase break-anywhere' }, shipment.fullName || customer.fullName || '-')),
              h('div', null, h('p', { className: 'text-[8px] font-black text-slate-400 uppercase' }, 'Número de teléfono'), h('p', { className: 'text-sm font-black text-slate-800 break-anywhere' }, shipment.phone || customer.phone || '-')),
              h('div', null, h('p', { className: 'text-[8px] font-black text-slate-400 uppercase' }, 'Origen'), h('p', { className: 'text-sm font-black text-slate-800 uppercase break-anywhere' }, shipment.o || '-')),
              h('div', null, h('p', { className: 'text-[8px] font-black text-slate-400 uppercase' }, 'Destino'), h('p', { className: 'text-sm font-black text-slate-800 uppercase break-anywhere' }, shipment.d || '-'))
            ),
            h('div', { className: 'grid grid-cols-2 gap-2' },
              steps.map((step, index) => h('button', {
                key: step,
                type: 'button',
                disabled: busy,
                onClick: () => changeStatus(shipment, step, index),
                className: `p-3 rounded-xl text-[9px] font-black uppercase border-2 transition-all disabled:opacity-50 ${shipment.status === step ? 'bg-red-500 border-red-500 text-white shadow-lg' : 'border-slate-100 text-slate-400'}`
              }, step))
            ),
            editingId === shipment.id ? h(EditShipmentForm, {
              form: editForm,
              setForm: setEditForm,
              saving: busy,
              errorMessage: editError,
              onSubmit: (event) => saveEdit(event, shipment),
              onCancel: () => { setEditingId(''); setEditError(''); }
            }) : null
          );
        })
      )
    )
  );
}
