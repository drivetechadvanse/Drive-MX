import { getApps } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

/*
 * Módulo independiente de recuperación de contraseña para Drive MX.
 *
 * Responsabilidades:
 * - Inserta el enlace "¿Olvidaste tu contraseña?" en la pantalla de inicio de sesión.
 * - Abre un formulario aislado para solicitar el correo registrado.
 * - Envía el correo seguro de recuperación con Firebase Authentication.
 *
 * No modifica el registro ni el inicio de sesión existentes. El archivo principal
 * solo necesita importar este módulo.
 */
const PasswordResetModule = (() => {
    'use strict';

    const MODULE_NAME = 'DriveMxPasswordReset';
    const STYLE_ID = 'drive-mx-password-reset-styles';
    const LINK_ROW_ID = 'drive-mx-password-reset-link-row';
    const MODAL_ID = 'drive-mx-password-reset-modal';
    const ROOT_ID = 'root';
    const FIREBASE_READY_ATTEMPTS = 30;
    const FIREBASE_READY_DELAY_MS = 100;

    const state = {
        observer: null,
        timer: null,
        modalOpen: false,
        sending: false,
        lastFocusedElement: null
    };

    function normalizeText(value = '') {
        return String(value || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    function wait(ms) {
        return new Promise(resolve => window.setTimeout(resolve, ms));
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .drive-mx-password-reset__link-row {
                margin-top: -0.25rem;
                text-align: center;
            }
            .drive-mx-password-reset__link {
                appearance: none;
                border: 0;
                background: transparent;
                color: #ef4444;
                cursor: pointer;
                font-size: 0.72rem;
                font-weight: 900;
                letter-spacing: 0.08em;
                line-height: 1.35;
                padding: 0.25rem 0.5rem;
                text-transform: uppercase;
                transition: color 0.2s ease, transform 0.2s ease;
            }
            .drive-mx-password-reset__link:hover,
            .drive-mx-password-reset__link:focus-visible {
                color: #b91c1c;
                outline: none;
                text-decoration: underline;
                transform: translateY(-1px);
            }
            .drive-mx-password-reset__overlay {
                align-items: center;
                background: rgba(15, 23, 42, 0.66);
                backdrop-filter: blur(8px);
                display: flex;
                inset: 0;
                justify-content: center;
                padding: 1.5rem;
                position: fixed;
                z-index: 9999;
            }
            .drive-mx-password-reset__card {
                animation: driveMxPasswordResetSlide 0.22s ease-out forwards;
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 1.5rem;
                box-shadow: 0 24px 80px rgba(15, 23, 42, 0.24);
                max-width: 28rem;
                position: relative;
                width: min(100%, 28rem);
            }
            .drive-mx-password-reset__content {
                padding: 2rem;
            }
            .drive-mx-password-reset__close {
                align-items: center;
                background: #f1f5f9;
                border: 0;
                border-radius: 999px;
                color: #475569;
                cursor: pointer;
                display: inline-flex;
                font-size: 1.25rem;
                font-weight: 900;
                height: 2.25rem;
                justify-content: center;
                line-height: 1;
                position: absolute;
                right: 1rem;
                top: 1rem;
                transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease;
                width: 2.25rem;
            }
            .drive-mx-password-reset__close:hover,
            .drive-mx-password-reset__close:focus-visible {
                background: #fee2e2;
                color: #dc2626;
                outline: none;
                transform: rotate(90deg);
            }
            .drive-mx-password-reset__badge {
                align-items: center;
                background: #fee2e2;
                border-radius: 999px;
                color: #dc2626;
                display: inline-flex;
                font-size: 0.68rem;
                font-weight: 900;
                gap: 0.35rem;
                letter-spacing: 0.08em;
                margin-bottom: 1rem;
                padding: 0.45rem 0.75rem;
                text-transform: uppercase;
            }
            .drive-mx-password-reset__title {
                color: #0f172a;
                font-size: 1.25rem;
                font-weight: 900;
                letter-spacing: 0.08em;
                line-height: 1.2;
                margin: 0;
                padding-right: 2.4rem;
                text-transform: uppercase;
            }
            .drive-mx-password-reset__description {
                color: #64748b;
                font-size: 0.82rem;
                font-weight: 700;
                line-height: 1.55;
                margin: 0.9rem 0 1.25rem;
            }
            .drive-mx-password-reset__form {
                display: grid;
                gap: 0.9rem;
            }
            .drive-mx-password-reset__label {
                color: #334155;
                font-size: 0.68rem;
                font-weight: 900;
                letter-spacing: 0.08em;
                text-transform: uppercase;
            }
            .drive-mx-password-reset__input {
                background: #f1f5f9;
                border: 2px solid transparent;
                border-radius: 0.75rem;
                color: #0f172a;
                font-size: 0.88rem;
                font-weight: 700;
                padding: 0.9rem 1rem;
                transition: background 0.2s ease, border-color 0.2s ease;
                width: 100%;
            }
            .drive-mx-password-reset__input:focus {
                background: #ffffff;
                border-color: #ef4444;
                outline: none;
            }
            .drive-mx-password-reset__button {
                align-items: center;
                background: #ef4444;
                border: 0;
                border-radius: 0.75rem;
                color: #ffffff;
                cursor: pointer;
                display: inline-flex;
                font-size: 0.75rem;
                font-weight: 900;
                gap: 0.5rem;
                justify-content: center;
                letter-spacing: 0.07em;
                min-height: 3rem;
                padding: 0.85rem 1rem;
                text-transform: uppercase;
                transition: background 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease, transform 0.2s ease;
                width: 100%;
            }
            .drive-mx-password-reset__button:hover,
            .drive-mx-password-reset__button:focus-visible {
                background: #dc2626;
                box-shadow: 0 12px 20px -10px rgba(239, 68, 68, 0.75);
                outline: none;
                transform: translateY(-1px);
            }
            .drive-mx-password-reset__button:disabled {
                cursor: wait;
                opacity: 0.72;
                transform: none;
            }
            .drive-mx-password-reset__message {
                border-radius: 0.85rem;
                display: none;
                font-size: 0.78rem;
                font-weight: 800;
                line-height: 1.45;
                padding: 0.85rem 1rem;
            }
            .drive-mx-password-reset__message.is-visible {
                display: block;
            }
            .drive-mx-password-reset__message--info {
                background: #eff6ff;
                color: #1d4ed8;
            }
            .drive-mx-password-reset__message--success {
                background: #ecfdf5;
                color: #047857;
            }
            .drive-mx-password-reset__message--error {
                background: #fef2f2;
                color: #b91c1c;
            }
            .drive-mx-password-reset__helper {
                color: #94a3b8;
                font-size: 0.68rem;
                font-weight: 800;
                line-height: 1.45;
                margin: 0.15rem 0 0;
                text-align: center;
                text-transform: uppercase;
            }
            @keyframes driveMxPasswordResetSlide {
                from { opacity: 0; transform: translateY(12px) scale(0.98); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }
            @media (max-width: 520px) {
                .drive-mx-password-reset__content {
                    padding: 1.6rem;
                }
                .drive-mx-password-reset__title {
                    font-size: 1.05rem;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function getLoginForm() {
        const forms = Array.from(document.querySelectorAll('form'));
        return forms.find(form => {
            const cardText = normalizeText(form.closest('.card-glass')?.textContent || form.parentElement?.textContent || '');
            const emailInput = form.querySelector('input[type="email"]');
            const passwordInput = form.querySelector('input[type="password"]');
            const submitButton = Array.from(form.querySelectorAll('button[type="submit"], button:not([type])'))
                .find(button => normalizeText(button.textContent) === 'entrar');

            return Boolean(
                cardText.includes('panel staff') &&
                emailInput &&
                passwordInput &&
                submitButton
            );
        }) || null;
    }

    function getLoginEmailValue() {
        const loginForm = getLoginForm();
        const emailInput = loginForm?.querySelector('input[type="email"]');
        return String(emailInput?.value || '').trim();
    }

    function createResetLinkRow() {
        const row = document.createElement('div');
        row.id = LINK_ROW_ID;
        row.className = 'drive-mx-password-reset__link-row';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'drive-mx-password-reset__link';
        button.textContent = '¿Olvidaste tu contraseña?';
        button.addEventListener('click', () => openModal(getLoginEmailValue()));

        row.appendChild(button);
        return row;
    }

    function ensureResetLink() {
        injectStyles();

        const loginForm = getLoginForm();
        const existingRow = document.getElementById(LINK_ROW_ID);

        if (!loginForm) {
            existingRow?.remove();
            return;
        }

        if (existingRow && loginForm.contains(existingRow)) return;

        existingRow?.remove();
        const passwordInput = loginForm.querySelector('input[type="password"]');
        const submitButton = loginForm.querySelector('button[type="submit"]');
        const row = createResetLinkRow();

        if (passwordInput) {
            passwordInput.insertAdjacentElement('afterend', row);
        } else if (submitButton) {
            submitButton.insertAdjacentElement('beforebegin', row);
        } else {
            loginForm.appendChild(row);
        }
    }

    function createModal() {
        const overlay = document.createElement('div');
        overlay.id = MODAL_ID;
        overlay.className = 'drive-mx-password-reset__overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'drive-mx-password-reset-title');

        overlay.innerHTML = `
            <div class="drive-mx-password-reset__card" role="document">
                <button type="button" class="drive-mx-password-reset__close" aria-label="Cerrar recuperación de contraseña">×</button>
                <div class="drive-mx-password-reset__content">
                    <div class="drive-mx-password-reset__badge" aria-hidden="true">🔐 Recuperación segura</div>
                    <h2 id="drive-mx-password-reset-title" class="drive-mx-password-reset__title">Restablecer contraseña</h2>
                    <p class="drive-mx-password-reset__description">Ingresa el correo electrónico registrado. Firebase Authentication enviará un enlace seguro para crear una nueva contraseña.</p>
                    <form class="drive-mx-password-reset__form" novalidate>
                        <label class="drive-mx-password-reset__label" for="drive-mx-password-reset-email">Correo electrónico registrado</label>
                        <input id="drive-mx-password-reset-email" class="drive-mx-password-reset__input" type="email" autocomplete="email" placeholder="correo@ejemplo.com" required />
                        <button type="submit" class="drive-mx-password-reset__button">Enviar enlace de recuperación</button>
                        <div class="drive-mx-password-reset__message" role="status" aria-live="polite"></div>
                        <p class="drive-mx-password-reset__helper">Después de cambiar la contraseña, inicia sesión normalmente con tu nueva clave.</p>
                    </form>
                </div>
            </div>
        `;

        overlay.addEventListener('click', event => {
            if (event.target === overlay) closeModal();
        });

        overlay.querySelector('.drive-mx-password-reset__close')?.addEventListener('click', closeModal);
        overlay.querySelector('form')?.addEventListener('submit', handlePasswordResetSubmit);

        return overlay;
    }

    function setMessage(type, text) {
        const modal = document.getElementById(MODAL_ID);
        const message = modal?.querySelector('.drive-mx-password-reset__message');
        if (!message) return;

        message.className = `drive-mx-password-reset__message drive-mx-password-reset__message--${type} is-visible`;
        message.textContent = text;
    }

    function clearMessage() {
        const modal = document.getElementById(MODAL_ID);
        const message = modal?.querySelector('.drive-mx-password-reset__message');
        if (!message) return;

        message.className = 'drive-mx-password-reset__message';
        message.textContent = '';
    }

    function setSending(isSending) {
        state.sending = isSending;
        const modal = document.getElementById(MODAL_ID);
        const submitButton = modal?.querySelector('.drive-mx-password-reset__button');
        const input = modal?.querySelector('#drive-mx-password-reset-email');

        if (submitButton) {
            submitButton.disabled = isSending;
            submitButton.textContent = isSending ? 'Enviando enlace...' : 'Enviar enlace de recuperación';
        }
        if (input) input.disabled = isSending;
    }

    function focusFirstModalField() {
        const modal = document.getElementById(MODAL_ID);
        const input = modal?.querySelector('#drive-mx-password-reset-email');
        window.requestAnimationFrame(() => input?.focus());
    }

    function openModal(prefilledEmail = '') {
        injectStyles();
        state.lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

        let modal = document.getElementById(MODAL_ID);
        if (!modal) {
            modal = createModal();
            document.body.appendChild(modal);
        }

        const input = modal.querySelector('#drive-mx-password-reset-email');
        if (input) {
            input.value = String(prefilledEmail || '').trim();
        }

        clearMessage();
        state.modalOpen = true;
        document.body.style.overflow = 'hidden';
        focusFirstModalField();
    }

    function closeModal() {
        const modal = document.getElementById(MODAL_ID);
        modal?.remove();
        state.modalOpen = false;
        state.sending = false;
        document.body.style.overflow = '';
        state.lastFocusedElement?.focus?.();
        state.lastFocusedElement = null;
    }

    async function getAuthWhenReady() {
        for (let attempt = 0; attempt < FIREBASE_READY_ATTEMPTS; attempt += 1) {
            const apps = getApps();
            if (apps.length > 0) return getAuth(apps[0]);
            await wait(FIREBASE_READY_DELAY_MS);
        }

        const error = new Error('Firebase Authentication no está listo.');
        error.code = 'drive-mx/auth-not-ready';
        throw error;
    }

    function getFriendlyErrorMessage(error) {
        const code = String(error?.code || '');

        if (code === 'auth/invalid-email' || code === 'auth/missing-email') {
            return 'Revisa el correo electrónico. Parece que el formato no es válido.';
        }
        if (code === 'auth/network-request-failed') {
            return 'No se pudo conectar con Firebase. Revisa tu conexión e inténtalo nuevamente.';
        }
        if (code === 'auth/too-many-requests') {
            return 'Por seguridad se hicieron demasiados intentos. Intenta de nuevo más tarde.';
        }
        if (code === 'auth/operation-not-allowed') {
            return 'La recuperación por correo no está habilitada en Firebase. Contacta al administrador.';
        }
        if (code === 'drive-mx/auth-not-ready') {
            return 'La autenticación aún se está preparando. Cierra esta ventana e inténtalo nuevamente.';
        }

        return 'No se pudo enviar el correo de recuperación. Intenta nuevamente en unos minutos.';
    }

    function getSuccessMessage(email) {
        return `Listo. Si ${email} está registrado, recibirá un correo con un enlace seguro para restablecer su contraseña.`;
    }

    async function handlePasswordResetSubmit(event) {
        event.preventDefault();
        if (state.sending) return;

        const form = event.currentTarget;
        const emailInput = form.querySelector('#drive-mx-password-reset-email');
        const email = String(emailInput?.value || '').trim().toLowerCase();

        if (!isValidEmail(email)) {
            setMessage('error', 'Ingresa un correo electrónico válido para enviar el enlace de recuperación.');
            emailInput?.focus();
            return;
        }

        setSending(true);
        setMessage('info', 'Estamos preparando tu enlace seguro de recuperación...');

        try {
            const auth = await getAuthWhenReady();
            auth.languageCode = 'es';
            await sendPasswordResetEmail(auth, email);
            setMessage('success', getSuccessMessage(email));
            form.reset();
        } catch (error) {
            console.error(`${MODULE_NAME}:`, error);

            if (String(error?.code || '') === 'auth/user-not-found') {
                setMessage('success', getSuccessMessage(email));
                form.reset();
            } else {
                setMessage('error', getFriendlyErrorMessage(error));
            }
        } finally {
            setSending(false);
        }
    }

    function handleKeydown(event) {
        if (event.key === 'Escape' && state.modalOpen && !state.sending) {
            closeModal();
        }
    }

    function scheduleEnsureResetLink() {
        window.clearTimeout(state.timer);
        state.timer = window.setTimeout(ensureResetLink, 60);
    }

    function start() {
        injectStyles();
        ensureResetLink();
        document.addEventListener('keydown', handleKeydown);

        const root = document.getElementById(ROOT_ID) || document.body;
        state.observer = new MutationObserver(scheduleEnsureResetLink);
        state.observer.observe(root, { childList: true, subtree: true });
    }

    return { start };
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', PasswordResetModule.start, { once: true });
} else {
    PasswordResetModule.start();
}
