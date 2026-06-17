import { getAuth, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

(function registerPasswordResetModule(global) {
    'use strict';

    const React = global.React;
    const APP_NAME = 'Drive MX';
    const SUPPORT_HINT = 'Revisa también la carpeta de spam o correo no deseado.';

    function cleanEmail(value) {
        return String(value || '').trim().toLowerCase();
    }

    function getFriendlyFirebaseError(error) {
        const code = String(error?.code || '');
        if (code.includes('auth/invalid-email')) return 'Ingresa un correo electrónico válido.';
        if (code.includes('auth/missing-email')) return 'Ingresa el correo electrónico registrado.';
        if (code.includes('auth/user-disabled')) return 'Esta cuenta está deshabilitada. Contacta al administrador.';
        if (code.includes('auth/too-many-requests')) return 'Se hicieron demasiados intentos. Inténtalo nuevamente más tarde.';
        if (code.includes('auth/network-request-failed')) return 'No se pudo conectar con Firebase. Revisa tu conexión a internet.';
        return 'No fue posible enviar el correo de recuperación. Verifica el correo e inténtalo nuevamente.';
    }

    async function sendResetEmail(email, options = {}) {
        const auth = getAuth();
        auth.languageCode = options.languageCode || 'es';

        const normalizedEmail = cleanEmail(email);
        if (!normalizedEmail) {
            const error = new Error('missing-email');
            error.code = 'auth/missing-email';
            throw error;
        }

        const actionCodeSettings = {
            url: options.continueUrl || global.location.origin,
            handleCodeInApp: false
        };

        await sendPasswordResetEmail(auth, normalizedEmail, actionCodeSettings);
        return normalizedEmail;
    }

    function PasswordResetComponent(props = {}) {
        const [isOpen, setIsOpen] = React.useState(false);
        const [email, setEmail] = React.useState('');
        const [status, setStatus] = React.useState({ type: '', message: '' });
        const [sending, setSending] = React.useState(false);
        const appName = props.appName || APP_NAME;
        const logoText = props.logoText || 'DMX';

        const close = () => {
            if (sending) return;
            setIsOpen(false);
            setEmail('');
            setStatus({ type: '', message: '' });
        };

        const submit = async (event) => {
            event.preventDefault();
            setSending(true);
            setStatus({ type: '', message: '' });
            try {
                const sentTo = await sendResetEmail(email, {
                    languageCode: props.languageCode || 'es',
                    continueUrl: props.continueUrl || global.location.origin
                });
                setStatus({
                    type: 'success',
                    message: `Listo. Enviamos un enlace seguro a ${sentTo} para restablecer tu contraseña. ${SUPPORT_HINT}`
                });
            } catch (error) {
                console.error('Password reset:', error);
                setStatus({ type: 'error', message: getFriendlyFirebaseError(error) });
            } finally {
                setSending(false);
            }
        };

        return React.createElement(React.Fragment, null,
            React.createElement('button', {
                type: 'button',
                onClick: () => setIsOpen(true),
                className: 'w-full text-[11px] font-black uppercase tracking-widest text-red-500 hover:text-red-600 text-center py-2'
            }, '¿Olvidaste tu contraseña?'),
            isOpen && React.createElement('div', {
                className: 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-6',
                role: 'dialog',
                'aria-modal': 'true',
                'aria-label': 'Recuperar contraseña'
            },
                React.createElement('div', { className: 'card-glass max-w-sm w-full p-8 animate-slide space-y-5' },
                    React.createElement('div', { className: 'flex flex-col items-center text-center gap-3' },
                        React.createElement('div', { className: 'w-14 h-14 rounded-2xl bg-red-500 text-white flex items-center justify-center text-sm font-black shadow-lg shadow-red-500/20' }, logoText),
                        React.createElement('div', null,
                            React.createElement('h2', { className: 'text-lg font-black uppercase tracking-widest' }, 'Recuperar contraseña'),
                            React.createElement('p', { className: 'text-[11px] font-bold text-slate-400 uppercase leading-relaxed mt-2' }, `Ingresa el correo registrado en ${appName}. Firebase enviará un enlace seguro para restablecer tu contraseña.`)
                        )
                    ),
                    React.createElement('form', { onSubmit: submit, className: 'space-y-4' },
                        React.createElement('input', {
                            required: true,
                            autoFocus: true,
                            className: 'input-field',
                            placeholder: 'CORREO ELECTRÓNICO REGISTRADO',
                            type: 'email',
                            value: email,
                            onChange: event => {
                                setEmail(event.target.value);
                                if (status.type === 'error') setStatus({ type: '', message: '' });
                            }
                        }),
                        status.message && React.createElement('div', {
                            className: `rounded-2xl p-4 text-[11px] font-bold leading-relaxed ${status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'}`
                        }, status.message),
                        React.createElement('button', {
                            type: 'submit',
                            disabled: sending,
                            className: `w-full btn-primary h-12 ${sending ? 'opacity-60 cursor-not-allowed' : ''}`
                        }, sending ? 'Enviando...' : 'Enviar enlace seguro'),
                        React.createElement('button', {
                            type: 'button',
                            disabled: sending,
                            onClick: close,
                            className: 'w-full h-11 rounded-xl bg-slate-100 text-slate-500 text-[11px] font-black uppercase tracking-widest hover:bg-slate-200 disabled:opacity-60'
                        }, 'Cerrar')
                    )
                )
            )
        );
    }

    global.DriveMxPasswordReset = Object.freeze({
        Component: PasswordResetComponent,
        sendResetEmail,
        getFriendlyFirebaseError
    });
})(window);
