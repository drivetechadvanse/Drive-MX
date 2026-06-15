/*
 * Módulo independiente de búsqueda para la portada principal de Drive MX.
 * Inserta la lupa/campo de búsqueda y filtra las tarjetas de productos ya publicadas
 * sin recargar la página ni modificar la lógica React existente.
 */
(() => {
    'use strict';

    const SEARCH_ROOT_ID = 'drive-mx-product-search';
    const NO_RESULTS_ID = 'drive-mx-search-no-results';
    const INVENTORY_TEXT = 'inventario disponible';
    const PRODUCTS_STORAGE_KEYS = ['driveMxProducts', 'driveMxAdminProducts'];

    const state = {
        open: false,
        query: '',
        timer: null
    };

    const CATEGORY_RULES = [
        {
            category: 'celular',
            aliases: ['celular', 'celulares', 'telefono', 'telefonos', 'teléfono', 'teléfonos', 'smartphone', 'smartphones', 'movil', 'móvil'],
            indicators: ['iphone', 'android', 'galaxy', 'smartphone', 'pixel', 'redmi']
        },
        {
            category: 'television',
            aliases: ['television', 'televisión', 'televisor', 'televisores', 'tv', 'pantalla', 'pantallas', 'smart tv'],
            indicators: ['smart tv', 'led', 'oled', 'qled', 'lcd', 'uhd', '4k', '8k', 'roku', 'bravia']
        },
        {
            category: 'licuadora',
            aliases: ['licuadora', 'licuadoras', 'batidora', 'batidoras', 'blender', 'vaso licuador'],
            indicators: ['blender', 'vaso licuador', 'nutribullet']
        },
        {
            category: 'computadora',
            aliases: ['computadora', 'computadoras', 'laptop', 'laptops', 'notebook', 'ordenador', 'pc'],
            indicators: ['macbook', 'thinkpad', 'ideapad', 'notebook']
        },
        {
            category: 'audifonos',
            aliases: ['audifonos', 'audífonos', 'auriculares', 'headphones', 'earbuds'],
            indicators: ['airpods', 'headphones', 'earbuds']
        },
        {
            category: 'refrigerador',
            aliases: ['refrigerador', 'refrigeradores', 'refri', 'nevera', 'congelador'],
            indicators: ['frigorifico', 'frigobar']
        },
        {
            category: 'lavadora',
            aliases: ['lavadora', 'lavadoras', 'secadora', 'secadoras', 'centro de lavado'],
            indicators: ['centro de lavado']
        },
        {
            category: 'microondas',
            aliases: ['microondas', 'horno de microondas', 'horno'],
            indicators: ['horno de microondas']
        },
        {
            category: 'camara',
            aliases: ['camara', 'cámara', 'camaras', 'cámaras', 'fotografia', 'fotografía'],
            indicators: ['canon', 'nikon', 'sony alpha', 'gopro', 'dslr', 'mirrorless']
        },
        {
            category: 'consola',
            aliases: ['consola', 'consolas', 'videojuego', 'videojuegos', 'gaming'],
            indicators: ['playstation', 'xbox', 'nintendo', 'switch', 'ps5', 'ps4']
        }
    ].map(rule => ({
        category: normalizeText(rule.category),
        aliases: rule.aliases.map(normalizeText),
        indicators: rule.indicators.map(normalizeText)
    }));

    function normalizeText(value) {
        return String(value ?? '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim()
            .replace(/\s+/g, ' ');
    }

    function escapeRegExp(value) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function containsTerm(haystack, needle) {
        const cleanNeedle = normalizeText(needle);
        if (!cleanNeedle) return true;
        const cleanHaystack = ` ${normalizeText(haystack)} `;
        if (cleanNeedle.length <= 2 || /^\d+$/.test(cleanNeedle)) {
            return new RegExp(`(^|\\s)${escapeRegExp(cleanNeedle)}(\\s|$)`).test(cleanHaystack);
        }
        return cleanHaystack.includes(` ${cleanNeedle} `) || cleanHaystack.includes(cleanNeedle);
    }

    function expandGenericSearchTerm(term) {
        const normalizedTerm = normalizeText(term);
        const expanded = new Set([normalizedTerm]);

        CATEGORY_RULES.forEach(rule => {
            const isGenericCategory = rule.category === normalizedTerm || rule.aliases.includes(normalizedTerm);
            if (isGenericCategory) {
                [rule.category, ...rule.aliases, ...rule.indicators].forEach(item => expanded.add(item));
            }
        });

        return Array.from(expanded).filter(Boolean);
    }

    function inferCategoryTermsFromText(text) {
        const normalized = normalizeText(text);
        const inferred = new Set();

        CATEGORY_RULES.forEach(rule => {
            const found = [rule.category, ...rule.aliases, ...rule.indicators].some(term => containsTerm(normalized, term));
            if (found) {
                [rule.category, ...rule.aliases].forEach(term => inferred.add(term));
            }
        });

        return Array.from(inferred).join(' ');
    }

    function readArrayFromStorage(key) {
        try {
            const parsed = JSON.parse(localStorage.getItem(key) || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    }

    function readPublishedProducts() {
        const products = [];

        PRODUCTS_STORAGE_KEYS.forEach(key => {
            products.push(...readArrayFromStorage(key));
        });

        try {
            for (let index = 0; index < localStorage.length; index += 1) {
                const key = localStorage.key(index) || '';
                if (key.startsWith('driveMxUserProducts_')) {
                    products.push(...readArrayFromStorage(key));
                }
            }
        } catch (error) {
            // Si localStorage no está disponible, el filtro seguirá usando el texto visible de las tarjetas.
        }

        const byId = new Map();
        products.forEach(product => {
            const id = String(product?.id || '').trim();
            if (id) byId.set(id, { ...(byId.get(id) || {}), ...product });
        });

        return byId;
    }

    function collectProductFields(value, depth = 0) {
        if (depth > 3 || value === null || value === undefined) return [];
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            const text = String(value).trim();
            if (!text || /^https?:\/\//i.test(text) || /^data:image\//i.test(text)) return [];
            return [text];
        }
        if (Array.isArray(value)) {
            return value.flatMap(item => collectProductFields(item, depth + 1));
        }
        if (typeof value === 'object') {
            return Object.entries(value).flatMap(([key, item]) => {
                const normalizedKey = normalizeText(key);
                if (['image', 'images', 'imageurl', 'createdat', 'updatedat'].includes(normalizedKey)) return [];
                return collectProductFields(item, depth + 1);
            });
        }
        return [];
    }

    function getCardProductId(card) {
        const text = card?.textContent || '';
        const match = text.match(/ID:\s*([^\s]+)/i);
        return match ? match[1].trim() : '';
    }

    function buildCardSearchText(card, productsById) {
        const id = getCardProductId(card);
        const storedProduct = id ? productsById.get(id) : null;
        const fields = [card?.textContent || ''];

        if (storedProduct) {
            fields.push(...collectProductFields(storedProduct));
            fields.push(
                storedProduct.category,
                storedProduct.categoria,
                storedProduct.keywords,
                storedProduct.palabrasClave,
                storedProduct.tags
            );
        }

        const baseText = fields.filter(Boolean).join(' ');
        return `${baseText} ${inferCategoryTermsFromText(baseText)}`;
    }

    function productMatches(card, productsById, query) {
        const normalizedQuery = normalizeText(query);
        if (!normalizedQuery) return true;

        const searchText = buildCardSearchText(card, productsById);
        if (containsTerm(searchText, normalizedQuery)) return true;

        const terms = normalizedQuery.split(' ').filter(Boolean);
        return terms.every(term => expandGenericSearchTerm(term).some(option => containsTerm(searchText, option)));
    }

    function injectStyles() {
        if (document.getElementById('drive-mx-search-styles')) return;

        const style = document.createElement('style');
        style.id = 'drive-mx-search-styles';
        style.textContent = `
            .drive-mx-inventory-header-with-search {
                flex-wrap: wrap;
            }
            .drive-mx-search {
                display: flex;
                align-items: center;
                justify-content: flex-end;
                gap: 0.55rem;
                flex-wrap: wrap;
                margin-left: auto;
            }
            .drive-mx-search__button {
                width: 2.65rem;
                height: 2.65rem;
                border: 0;
                border-radius: 0.9rem;
                background: #f1f5f9;
                color: #475569;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            .drive-mx-search__button:hover,
            .drive-mx-search__button[aria-expanded="true"] {
                background: #fef2f2;
                color: #dc2626;
                transform: translateY(-1px);
            }
            .drive-mx-search__input {
                width: min(19rem, 72vw);
                min-height: 2.65rem;
                border: 2px solid #e2e8f0;
                border-radius: 0.95rem;
                background: #ffffff;
                color: #0f172a;
                font-size: 0.78rem;
                font-weight: 800;
                outline: none;
                padding: 0 0.9rem;
                text-transform: uppercase;
                box-shadow: 0 8px 18px rgba(15, 23, 42, 0.05);
            }
            .drive-mx-search__input:focus {
                border-color: #ef4444;
                box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.1);
            }
            .drive-mx-search__input[hidden] {
                display: none;
            }
            .drive-mx-search__empty {
                margin-top: 1.25rem;
                padding: 1.4rem;
                border: 2px dashed #fecaca;
                border-radius: 1.25rem;
                background: #fff7f7;
                color: #dc2626;
                text-align: center;
                font-size: 0.72rem;
                font-weight: 900;
                letter-spacing: 0.08em;
                text-transform: uppercase;
            }
            @media (max-width: 640px) {
                .drive-mx-inventory-header-with-search {
                    align-items: flex-start;
                }
                .drive-mx-search {
                    width: 100%;
                    justify-content: flex-start;
                    margin-left: 0;
                    margin-top: 0.75rem;
                }
                .drive-mx-search__input {
                    flex: 1 1 100%;
                    width: 100%;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function getInventorySection() {
        const sections = Array.from(document.querySelectorAll('section'));
        return sections.find(section => normalizeText(section.textContent).includes(INVENTORY_TEXT)) || null;
    }

    function getInventoryHeader(section) {
        return section?.querySelector('.flex.items-end.justify-between') || section?.firstElementChild || section;
    }

    function createSearchControls() {
        const root = document.createElement('div');
        root.id = SEARCH_ROOT_ID;
        root.className = 'drive-mx-search';
        root.setAttribute('role', 'search');
        root.setAttribute('aria-label', 'Buscar productos publicados');

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'drive-mx-search__button';
        button.setAttribute('aria-label', 'Abrir buscador de productos');
        button.setAttribute('aria-expanded', String(state.open));
        button.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2.5"/>
            </svg>
        `;

        const input = document.createElement('input');
        input.type = 'search';
        input.className = 'drive-mx-search__input';
        input.placeholder = 'Buscar producto, categoría o palabra clave';
        input.autocomplete = 'off';
        input.value = state.query;
        input.hidden = !state.open;

        button.addEventListener('click', () => {
            state.open = !state.open;
            button.setAttribute('aria-expanded', String(state.open));
            input.hidden = !state.open;
            if (state.open) {
                requestAnimationFrame(() => input.focus());
            } else {
                state.query = '';
                input.value = '';
                applyFilter();
            }
        });

        input.addEventListener('input', event => {
            state.query = event.target.value;
            applyFilter();
        });

        input.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                state.query = '';
                input.value = '';
                state.open = false;
                input.hidden = true;
                button.setAttribute('aria-expanded', 'false');
                applyFilter();
                button.focus();
            }
        });

        root.append(button, input);
        return root;
    }

    function ensureNoResultsMessage(section, visible) {
        let message = section.querySelector(`#${NO_RESULTS_ID}`);
        if (!visible) {
            message?.remove();
            return;
        }

        if (!message) {
            message = document.createElement('p');
            message.id = NO_RESULTS_ID;
            message.className = 'drive-mx-search__empty';
            message.textContent = 'No se encontraron productos disponibles.';
            const grid = section.querySelector('.grid');
            if (grid?.parentNode) grid.insertAdjacentElement('afterend', message);
            else section.appendChild(message);
        }
    }

    function applyFilter() {
        const section = getInventorySection();
        if (!section) return;

        const query = state.query;
        const cards = Array.from(section.querySelectorAll('article'));
        const productsById = readPublishedProducts();
        let visibleCount = 0;

        cards.forEach(card => {
            const match = productMatches(card, productsById, query);
            card.style.display = match ? '' : 'none';
            card.setAttribute('aria-hidden', String(!match));
            if (match) visibleCount += 1;
        });

        ensureNoResultsMessage(section, Boolean(normalizeText(query)) && visibleCount === 0);
    }

    function ensureSearchModule() {
        injectStyles();

        const section = getInventorySection();
        const existingRoot = document.getElementById(SEARCH_ROOT_ID);

        if (!section) {
            existingRoot?.remove();
            return;
        }

        if (!existingRoot || !section.contains(existingRoot)) {
            existingRoot?.remove();
            const header = getInventoryHeader(section);
            header.classList.add('drive-mx-inventory-header-with-search');
            header.appendChild(createSearchControls());
        } else {
            getInventoryHeader(section)?.classList.add('drive-mx-inventory-header-with-search');
            const input = existingRoot.querySelector('.drive-mx-search__input');
            const button = existingRoot.querySelector('.drive-mx-search__button');
            if (input) {
                input.value = state.query;
                input.hidden = !state.open;
            }
            if (button) button.setAttribute('aria-expanded', String(state.open));
        }

        applyFilter();
    }

    function scheduleEnsure() {
        window.clearTimeout(state.timer);
        state.timer = window.setTimeout(ensureSearchModule, 60);
    }

    function start() {
        ensureSearchModule();

        const root = document.getElementById('root') || document.body;
        const observer = new MutationObserver(scheduleEnsure);
        observer.observe(root, { childList: true, subtree: true });

        window.addEventListener('storage', scheduleEnsure);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
