import { NewShipmentForm } from './NewShipmentForm.js';
import { createEmptyShipmentForm, createUniqueShipment } from '../services/newShipmentService.js';

const h = globalThis.React?.createElement;
const useState = globalThis.React?.useState;

export function AdminNewShipmentCard(props = {}) {
  if (!h || !useState) return null;
  const [form, setForm] = useState(() => createEmptyShipmentForm());
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [lastGuide, setLastGuide] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setErrorMessage('');
    setLastGuide('');

    try {
      const assignedUser = (Array.isArray(props.users) ? props.users : []).find((user) =>
        String(user?.uid || user?.id || '').trim() === String(form.op || '').trim()
      ) || null;
      const shipment = await createUniqueShipment({
        fbase: props.fbase,
        appId: props.appId,
        form,
        mode: 'admin',
        currentUser: props.currentUser || props.sessionUser || {},
        assignedUser,
        mailSettings: props.emailSettings || {}
      });
      setForm(createEmptyShipmentForm());
      setLastGuide(shipment.id);
      if (shipment.labelEmailSent !== true) {
        setErrorMessage(`La guía ${shipment.id} se creó correctamente, pero no se pudo enviar la etiqueta PDF: ${shipment.labelEmailError || 'Error de correo.'}`);
      }
      props.onCreated?.(shipment);
    } catch (error) {
      console.error('Crear guía administrativa:', error);
      setErrorMessage(error?.message || 'No se pudo crear la guía.');
    } finally {
      setSubmitting(false);
    }
  };

  return h('div', { className: 'md:col-span-1 card-glass p-6 space-y-6' },
    h('div', null,
      h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400 drive-mx-panel-section-title' }, 'Nuevo Envío'),
      h('p', { className: 'text-[8px] font-bold text-slate-300 uppercase mt-1' }, 'La guía se genera automáticamente al guardar')
    ),
    h(NewShipmentForm, {
      form,
      setForm,
      users: props.users,
      showUserSelect: true,
      submitting,
      errorMessage,
      onSubmit: handleSubmit,
      submitLabel: 'Crear Guía'
    }),
    lastGuide ? h('div', { className: 'rounded-2xl bg-green-50 border border-green-100 p-4 text-center' },
      h('p', { className: 'text-[8px] font-black text-green-600 uppercase tracking-widest' }, 'Guía creada correctamente'),
      h('p', { className: 'text-xl font-black text-green-700 mt-1' }, lastGuide)
    ) : null
  );
}
