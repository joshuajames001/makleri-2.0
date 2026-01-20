/**
 * ANELA Digital - Universal Admin Editor
 * Handles generic content editing, Blog management, and Legal texts.
 * STRICT SCHEMA: site_content (wide row), listings, articles, legal_texts.
 */

window.UniversalEditor = {
    isEnabled: false,
    config: null,
    cache: {},

    // 4. PREVENT DOUBLE INIT
    init: function (config) {
        if (window.UniversalEditorInitialized) {
            console.log("Universal Editor: Already initialized.");
            return;
        }
        window.UniversalEditorInitialized = true;

        this.config = config;
        console.log("Universal Editor: Initializing...");

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.start());
        } else {
            this.start();
        }
    },

    start: function () {
        this.checkAdminParam();
        this.bindEvents();
        // Expose alias
        this.fetchAndApplyContent = this.loadContent;
        this.loadContent();
    },

    checkAdminParam: function () {
        const params = new URLSearchParams(window.location.search);
        if (params.has('admin')) {
            this.toggleMode(true);
        }
    },

    toggleMode: function (forceState = null) {
        this.isEnabled = forceState !== null ? forceState : !this.isEnabled;

        if (this.isEnabled) {
            document.body.classList.add('admin-mode');
            this.renderEditIcons();
            if (window.showToast) window.showToast('Admin Mód Aktivován');
        } else {
            document.body.classList.remove('admin-mode');
        }
    },

    bindEvents: function () {
        // Global listeners
    },

    // 1. STOP DATA ERRORS (406 & Object Error)
    // Fetch SINGLE record from 'site_content' (Wide Table Schema)
    loadContent: async function () {
        if (!window.supabaseClient) return;

        try {
            // Fetch single record, no filters
            const { data, error } = await window.supabaseClient
                .from('site_content')
                .select('*')
                .limit(1)
                .single();

            if (error) {
                console.error("Content Load (Single) Error:", error);
                // Fallback attempt: if .single() failed because it's multiple rows, try just select
                // But per instructions we expect single record logic.
                return;
            }

            if (!data) return;

            // Direct access to columns
            // e.g. data.awards, data.first_name
            // We iterate keys to populate cache
            Object.keys(data).forEach(key => {
                const val = data[key];
                // Store in cache
                this.cache[key] = val;
                // Apply update
                this.applyDirect(key, val);
            });

            console.log("Content Loaded. Awards:", data.awards ? "Found" : "Not Found");

        } catch (e) {
            console.error("Content Load Critical Error:", e);
        }
    },

    applyDirect: function (key, value) {
        if (typeof value === 'object' && value !== null) {
            // 2. FIX [object Object] 404
            // Ignore objects unless simpler handling needed
            return;
        }

        const elements = document.querySelectorAll(`[data-key="${key}"]`);
        elements.forEach(el => this.updateElement(el, value, el.dataset.type));
    },

    updateElement: function (el, value, type) {
        if (value === undefined || value === null) return;

        if (type === 'image' || el.tagName === 'IMG') {
            el.src = value;
        } else if (type === 'link' || el.tagName === 'A') {
            el.href = value;
        } else if (type === 'html') {
            el.innerHTML = value;
        } else {
            el.innerText = value;
        }
    },

    renderEditIcons: function () {
        if (!this.isEnabled) return;

        document.querySelectorAll('[data-editable="true"]').forEach(el => {
            if (el.classList.contains('editable-ready')) return;
            el.classList.add('editable-ready', 'group', 'relative', 'cursor-pointer', 'rounded', 'outline-none', 'focus:ring-2', 'focus:ring-brand-gold');
            el.title = "Klikněte pro úpravu";
            el.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                this.openEditModal(el);
            });
        });
    },

    openEditModal: function (el) {
        const key = el.dataset.key;
        const type = el.dataset.type || 'text';

        // Fetch from cache
        let currentVal = this.cache[key];

        // DOM Fallback
        if (currentVal === undefined) {
            currentVal = (type === 'image' || el.tagName === 'IMG') ? el.src : el.innerText;
        }

        const newVal = prompt(`Upravit: ${key}`, currentVal);
        if (newVal !== null && newVal !== currentVal) {
            this.saveContent(key, newVal, type);
        }
    },

    saveContent: async function (key, value, type) {
        // Single Row Update Strategy
        const payload = {
            [key]: value,
            updated_at: new Date().toISOString()
        };

        // We assume we are updating the MAIN broker record (e.g. ID 1) logic
        // Or if 'site_content' has only 1 row, we update that row.

        // Since we don't know the ID from the fetch (unless we cached it), careful.
        // Assuming we fetched it, we might have stored ID.
        // For safety, let's assume we update where ID=1 or something, 
        // OR better: if loadContent returns data.id, usage would be better.
        // Adhering to prompt simplistic style:

        // Attempt update on first row found (dangerous but requested style)
        // Or better: Upsert based on key? No, row-based means update column.

        // Let's assume there is an ID we can fetch or we update all (limit 1).
        // Actually, user instruction was: fetch SINGLE record from 'site_content'.

        // We will try updating ID=1 as standard placeholder for single-site config
        // or getting ID from cache if we stored it.
        const id = this.cache['id'] || 1;

        const { error } = await window.supabaseClient
            .from('site_content')
            .update(payload)
            .eq('id', id);

        if (!error) {
            this.cache[key] = value;
            this.applyDirect(key, value);
            if (window.showToast) window.showToast('Uloženo');
        } else {
            alert("Chyba: " + error.message);
        }
    }
};

// 4. BLOG MANAGER
window.BlogManager = {
    articles: [],

    initPublic: async function () {
        const container = document.getElementById('public-blog-container');
        if (!container) return;

        this.renderAdminButton();

        try {
            const { data, error } = await window.supabaseClient
                .from('articles')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            this.articles = data || [];
            this.renderPublicGrid();
        } catch (e) {
            console.error("Blog Fetch Error:", e);
            container.innerHTML = '<div class="text-center text-red-500 py-4">Chyba načítání</div>';
        }
    },

    renderAdminButton: function () {
        if (!window.UniversalEditor || !window.UniversalEditor.isEnabled) return;
        const header = document.querySelector('#clanky-view h2');
        if (!header || document.getElementById('btn-mgr-blog')) return;

        const btn = document.createElement('button');
        btn.id = 'btn-mgr-blog';
        btn.innerText = '⚙️ Správa Článků';
        btn.className = 'ml-4 bg-brand-gold text-white text-xs px-3 py-1 rounded shadow hover:bg-brand-blue cursor-pointer uppercase font-bold relative -top-1';
        btn.onclick = (e) => {
            e.preventDefault();
            const modal = document.getElementById('add-property-modal');
            if (modal) {
                modal.classList.remove('hidden');
                if (window.switchAdminTab) window.switchAdminTab('articles');
            }
        };
        header.appendChild(btn);
    },

    renderPublicGrid: function () {
        const container = document.getElementById('public-blog-container');
        if (!container) return;

        if (this.articles.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-400 py-12">Žádné články.</div>';
            return;
        }

        container.innerHTML = this.articles.map(a => `
            <div class="flex flex-col md:flex-row gap-8 items-start group">
                <div class="w-full md:w-2/5 aspect-[4/3] rounded-2xl overflow-hidden shadow-lg bg-gray-100 relative">
                    <img src="${(a.image_url && typeof a.image_url === 'string') ? a.image_url : 'img/placeholder.jpg'}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                </div>
                <div class="w-full md:w-3/5">
                    <div class="text-xs text-gray-400 mb-2 flex items-center">
                         📅 ${new Date(a.created_at || Date.now()).toLocaleDateString('cs-CZ')}
                    </div>
                    <h3 class="text-2xl font-bold text-brand-blue mb-4 group-hover:text-brand-gold transition-colors">${a.title}</h3>
                    <p class="text-gray-600 mb-6 leading-relaxed">${a.preview_text || ''}</p>
                    <a href="${a.external_url || '#'}" target="${a.external_url ? '_blank' : '_self'}" class="text-brand-blue font-bold hover:text-brand-gold transition-colors inline-flex items-center">
                        ${a.external_url ? 'Číst celý článek' : 'Více info brzy'} 
                        <span class="ml-2">→</span>
                    </a>
                </div>
            </div>
        `).join('');
    },

    // ADMIN INTERFACE
    // Changed name to renderArticlesAdmin as implied by prompt, but keeping entry point standard
    fetchForAdmin: async function () {
        await this.initPublic(); // Refresh data
        this.renderArticlesAdmin();
    },

    renderArticlesAdmin: function () {
        const container = document.getElementById('blog-items-container');
        if (!container) return;

        // 3. GUARANTEE BUTTON VISIBILITY
        // Inject button at the very top using insertAdjacentHTML
        // Clear container first to allow full redraw
        let listHTML = '';

        if (this.articles.length === 0) {
            listHTML = '<div class="text-center py-4 text-gray-400">Zatím žádné články. Přidejte první!</div>';
        } else {
            listHTML = this.articles.map(a => `
                <div class="flex justify-between items-center bg-white p-4 border border-gray-100 rounded shadow-sm mb-2">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 bg-gray-200 rounded overflow-hidden">
                            <img src="${(a.image_url && typeof a.image_url === 'string') ? a.image_url : 'img/placeholder.jpg'}" class="w-full h-full object-cover">
                        </div>
                        <div>
                            <div class="font-bold text-brand-blue text-sm">${a.title}</div>
                            <div class="text-xs text-gray-400">${new Date(a.created_at).toLocaleDateString()}</div>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="window.BlogManager.edit('${a.id}')" class="text-blue-500 hover:text-blue-700 p-2 font-bold">UPRAVIT</button>
                        <button onclick="window.BlogManager.delete('${a.id}')" class="text-red-500 hover:text-red-700 p-2 font-bold">SMAZAT</button>
                    </div>
                </div>
            `).join('');
        }

        container.innerHTML = listHTML;

        // INJECT BUTTON AT TOP (Floating Fixed)
        // User requested: "fixnuto na dolni roh" (fixed to bottom right)
        // We inject it into the container but with fixed positioning it will stay on screen.
        const btnHTML = `<div style="position: fixed; bottom: 40px; right: 40px; z-index: 9999;">
                        <button id="add-article-btn" type="button" onclick="window.BlogManager.openEditor()" 
                                style="background-color: #d4af37; color: white; width: 60px; height: 60px; border-radius: 50%; font-weight: bold; font-size: 24px; cursor: pointer; box-shadow: 0 4px 15px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; transition: transform 0.2s;">
                          ＋
                        </button>
                      </div>`;

        // Remove existing button if any to prevent duplicates during re-render
        const existingBtn = document.getElementById('add-article-btn');
        if (existingBtn) existingBtn.parentElement.remove();

        container.insertAdjacentHTML('afterbegin', btnHTML);
    },

    edit: function (id) {
        const a = this.articles.find(x => x.id === id);
        if (!a) return;

        const setVal = (eid, val) => { const el = document.getElementById(eid); if (el) el.value = val || ''; };
        setVal('blog-id', a.id);
        setVal('blog-title', a.title);
        const d = a.created_at ? a.created_at.split('T')[0] : '';
        setVal('blog-date', d);
        setVal('blog-image', a.image_url);
        // Changed to description based on verified schema
        setVal('blog-desc', a.description || '');
        setVal('blog-link', a.external_url);

        this.openEditor();
    },

    openEditor: function () {
        console.log("BlogManager: Opening Editor");
        document.getElementById('blog-list-view')?.classList.add('hidden');
        document.getElementById('blog-editor-view')?.classList.remove('hidden');
        // HIDE MAIN FOOTER to prevent overlap
        const footerInfo = document.querySelector('.sticky.bottom-0');
        if (footerInfo) footerInfo.classList.add('hidden');
    },

    closeEditor: function () {
        document.getElementById('blog-editor-view')?.classList.add('hidden');
        document.getElementById('blog-list-view')?.classList.remove('hidden');
        document.getElementById('blog-id').value = '';
        ['blog-title', 'blog-date', 'blog-image', 'blog-desc', 'blog-link'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        // Clear ID explicitly
        document.getElementById('blog-id').value = '';
    },

    openEditor: function () {
        console.log("BlogManager: Opening Editor");
        // Clear previous state if opening fresh
        if (document.getElementById('blog-id') && !document.getElementById('blog-id').value) {
            this.clearForm();
        }

        document.getElementById('blog-list-view')?.classList.add('hidden');
        document.getElementById('blog-editor-view')?.classList.remove('hidden');

        // HIDE MAIN FOOTER to prevent overlap
        const footerInfo = document.querySelector('.sticky.bottom-0');
        if (footerInfo) footerInfo.classList.add('hidden');
    },

    clearForm: function () {
        ['blog-id', 'blog-title', 'blog-date', 'blog-image', 'blog-desc', 'blog-link'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    },

    saveArticle: async function () {
        console.log("BlogManager: Saving Article...");
        const getVal = (eid) => {
            const el = document.getElementById(eid);
            return el ? el.value.trim() : '';
        };

        const id = getVal('blog-id');
        const title = getVal('blog-title');

        if (!title) {
            alert('Chybí titulek článku. Prosím vyplňte jej.');
            return;
        }

        const payload = {
            title: title,
            // If date empty, use NOW, else ISO string from date input
            created_at: getVal('blog-date') ? new Date(getVal('blog-date')).toISOString() : new Date().toISOString(),
            image_url: getVal('blog-image'),
            // Changed to description
            description: getVal('blog-desc'),
            external_url: getVal('blog-link')
        };

        console.log("Payload:", payload);

        let err;
        if (id) {
            console.log("Updating ID:", id);
            const { error } = await window.supabaseClient.from('articles').update(payload).eq('id', id);
            err = error;
        } else {
            console.log("Inserting New Article");
            const { error } = await window.supabaseClient.from('articles').insert([payload]);
            err = error;
        }

        if (!err) {
            if (window.showToast) window.showToast('Článek úspěšně uložen');
            this.closeEditor();
            this.fetchForAdmin();
        } else {
            console.error("Save Error:", err);
            alert('Chyba při ukládání: ' + err.message);
        }
    },

    delete: async function (id) {
        if (!confirm('Opravdu smazat?')) return;
        const { error } = await window.supabaseClient.from('articles').delete().eq('id', id);
        if (!error) this.fetchForAdmin();
        else alert('Chyba: ' + error.message);
    }
};


// 5. LEGAL MANAGER (Strict)
window.LegalManager = {
    cache: {},
    init: async function () {
        if (!window.supabaseClient) return;

        const { data, error } = await window.supabaseClient.from('legal_texts').select('*');
        if (data) {
            data.forEach(item => {
                const el = document.getElementById(`legal-${item.section_type}`);
                // Changed content to content_text
                if (el) el.value = item.content_text || '';
            });
        }
    },
    saveLegal: async function (type) {
        const el = document.getElementById(`legal-${type}`);
        if (!el) return;
        const { error } = await window.supabaseClient.from('legal_texts').upsert({
            section_type: type,
            // Changed content to content_text
            content_text: el.value,
            updated_at: new Date().toISOString()
        }, { onConflict: 'section_type' });

        if (!error) { if (window.showToast) window.showToast('Uloženo'); }
        else alert('Chyba: ' + error.message);
    }
};

// 6. GLOBAL INIT & TAB SWITCHER
window.switchAdminTab = function (tabName) {
    document.querySelectorAll('[id^="admin-tab-"]').forEach(el => el.classList.add('hidden'));
    const t = document.getElementById(`admin-tab-${tabName}`); if (t) t.classList.remove('hidden');

    document.querySelectorAll('[id^="tab-btn-"]').forEach(btn => {
        btn.classList.remove('border-brand-gold', 'text-brand-blue');
        btn.classList.add('border-transparent', 'text-gray-400');
    });
    const b = document.getElementById(`tab-btn-${tabName}`);
    if (b) { b.classList.add('border-brand-gold', 'text-brand-blue'); b.classList.remove('border-transparent', 'text-gray-400'); }

    // CONTEXTUAL BUTTON LOGIC
    const savePropBtn = document.getElementById('btn-save-property');
    if (savePropBtn) {
        if (tabName === 'properties') {
            savePropBtn.classList.remove('hidden');
        } else {
            savePropBtn.classList.add('hidden');
        }
    }

    if (tabName === 'legal') window.LegalManager.init();
    if (tabName === 'articles') window.BlogManager.fetchForAdmin();
};

document.addEventListener('DOMContentLoaded', () => {
    if (window.supaConfig && window.UniversalEditor) {
        window.UniversalEditor.init(window.supaConfig);
    }
    setTimeout(() => {
        if (window.BlogManager) window.BlogManager.initPublic();
        // Init Hash Handler
        if (window.PropertyDetailManager) window.PropertyDetailManager.init();
    }, 1000);
});

// 7. PROPERTY DETAIL MANAGER (Restored)
// 7. PROPERTY DETAIL MANAGER (Premium "Jeseniova" Standard)
window.PropertyDetailManager = {
    init: function () {
        // Define Close Globally immediately
        window.closePropertyDetail = () => {
            // Reset Hash if we are just closing via button (optional, but good for history)
            // If we are closing via Back button, hash is already changed.
            // We can check if we need to change hash.
            if (window.location.hash.includes('listing-detail')) {
                window.location.hash = 'nabidka-view'; // Default exit
            }

            const detail = document.getElementById('property-detail');
            if (detail) {
                detail.classList.add('hidden');
                detail.style.cssText = ""; // Remove fixed/z-index
                detail.innerHTML = "";     // Clear to save memory
            }
            document.body.style.overflow = ''; // Unlock scroll
        };

        window.addEventListener('hashchange', () => this.handleHash());

        // Initial Check
        this.handleHash();
    },

    handleHash: async function () {
        const hash = window.location.hash;

        // EXIT CONDITION: If hash is NOT listing-detail, ensure we are closed.
        if (!hash.startsWith('#listing-detail')) {
            const detail = document.getElementById('property-detail');
            if (detail && !detail.classList.contains('hidden')) {
                // Manually close without changing hash (since hash is already changed)
                detail.classList.add('hidden');
                detail.style.cssText = "";
                detail.innerHTML = "";
                document.body.style.overflow = '';
            }
            return;
        }

        const params = new URLSearchParams(hash.split('?')[1]);
        const id = params.get('id');
        if (!id) return;

        this.openDetail(id);
    },

    openDetail: async function (id) {
        console.log("PropertyManager: Opening Premium Detail for ID", id);
        const detailEl = document.getElementById('property-detail');
        if (!detailEl) return;

        // 1. CRITICAL CSS FIX: Force Overlay Mode
        detailEl.style.cssText = "display:block !important; position:fixed; top:0; left:0; width:100%; height:100vh; background:white; z-index:9999; overflow-y:auto;";

        // Show Loading
        detailEl.innerHTML = '<div class="flex items-center justify-center h-screen bg-white"><div class="flex flex-col items-center"><div class="w-16 h-16 border-4 border-brand-gold border-t-transparent rounded-full animate-spin mb-4"></div><div class="text-brand-blue font-bold animate-pulse">Načítám nemovitost...</div></div></div>';

        // Lock body scroll
        document.body.style.overflow = 'hidden';

        // Fetch Data
        try {
            const { data, error } = await window.supabaseClient
                .from('listings')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;
            if (!data) throw new Error("Nemovitost nenalezena");

            this.renderDetail(detailEl, data);
        } catch (e) {
            console.error("Detail Error:", e);
            detailEl.innerHTML = `<div class="p-10 text-center text-red-500 flex flex-col items-center justify-center h-screen">
                <h3 class="text-2xl font-bold mb-4">Chyba</h3>
                <p>${e.message}</p> 
                <button onclick="window.closePropertyDetail()" class="mt-6 bg-gray-200 px-6 py-2 rounded font-bold hover:bg-gray-300">Zavřít</button>
            </div>`;
        }
    },

    renderDetail: function (container, item) {
        // PREPARE DATA
        const gallery = (item.gallery_images || []).map(img =>
            `<div onclick="window.open('${img}', '_blank')" class="cursor-pointer aspect-[4/3] rounded-xl overflow-hidden shadow-lg hover:scale-105 transition-transform"><img src="${img}" class="w-full h-full object-cover"></div>`
        ).join('');

        const units = (item.units_table && item.units_table.length > 0) ? `
            <div class="py-24 bg-gray-50">
                <div class="container mx-auto px-6 lg:px-12 max-w-5xl">
                    <div class="text-center mb-12">
                        <h3 class="text-3xl font-bold text-brand-blue font-display">Jednotky v projektu</h3>
                    </div>
                    <div class="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                        <div class="overflow-x-auto">
                            <table class="w-full text-left border-collapse">
                                <thead class="bg-gray-50 text-gray-400 uppercase text-xs tracking-wider">
                                    <tr><th class="p-6">Jednotka</th><th class="p-6">Dispozice</th><th class="p-6">Plocha</th><th class="p-6">Cena</th><th class="p-6">Status</th></tr>
                                </thead>
                                <tbody class="divide-y divide-gray-100 text-sm">
                                    ${item.units_table.map(u => `
                                        <tr class="hover:bg-blue-50 transition-colors">
                                            <td class="p-6 font-bold text-brand-blue">${u.id || '-'}</td>
                                            <td class="p-6">${u.disposition || '-'}</td>
                                            <td class="p-6">${u.area || '-'}</td>
                                            <td class="p-6">${u.price || '-'}</td>
                                            <td class="p-6"><span class="px-3 py-1 rounded-full text-xs font-bold uppercase ${u.status === 'Volné' || u.status === 'Aktuální' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">${u.status || '-'}</span></td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>` : '';

        // RENDER HTML (Premium Template)
        const html = `
            <div class="relative bg-white min-h-screen pb-0 animate-fade-in">
                <!-- Close Button (Fixed) -->
                <button onclick="window.closePropertyDetail()" class="fixed top-6 right-6 bg-white/10 backdrop-blur-md rounded-full p-4 shadow-2xl z-50 hover:bg-white hover:text-brand-blue text-white transition-all transform hover:scale-110 border border-white/20 group">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    <span class="absolute right-full mr-4 bg-white text-brand-blue text-xs font-bold px-3 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Zavřít</span>
                </button>

                <!-- 1. HERO SECTION (Full Screen) -->
                <div class="relative h-screen w-full overflow-hidden">
                    <img src="${item.main_image || item.image || 'img/placeholder.jpg'}" class="absolute inset-0 w-full h-full object-cover">
                    <div class="absolute inset-0 bg-black/40"></div>
                    <div class="absolute inset-0 bg-gradient-to-t from-brand-dark via-transparent to-transparent opacity-90"></div>
                    
                    <div class="absolute inset-0 flex flex-col items-center justify-center text-center p-6 pb-24">
                        <div class="animate-fade-in-up">
                             <span class="inline-block bg-brand-gold text-brand-blue font-bold px-6 py-2 rounded-full text-sm uppercase tracking-widest mb-8 shadow-glow transform hover:scale-105 transition-transform cursor-default theme-badge">
                                ${item.status || 'NA PRODEJ'}
                            </span>
                            <h1 class="text-5xl lg:text-7xl font-bold text-white mb-6 drop-shadow-2xl max-w-5xl leading-tight font-display">
                                ${item.title}
                            </h1>
                            <p class="text-xl lg:text-2xl text-blue-100 font-light max-w-3xl mx-auto mb-12 flex items-center justify-center gap-2">
                                <svg class="w-6 h-6 text-brand-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                                ${item.location}
                            </p>
                            <p class="text-4xl lg:text-5xl font-bold text-brand-gold drop-shadow-lg font-display">
                                ${item.price}
                            </p>
                        </div>
                    </div>
                    <div class="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce text-white/50">
                        <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>
                    </div>
                </div>

                <!-- 2. CONTENT SECTION (Centered) -->
                <div class="bg-white py-24 relative z-10">
                    <div class="container mx-auto px-6 lg:px-12">
                        <div class="max-w-4xl mx-auto text-center mb-16">
                            <h2 class="text-sm font-bold text-brand-gold uppercase tracking-widest mb-4">O nemovitosti</h2>
                            <h3 class="text-4xl lg:text-5xl font-bold text-brand-blue mb-8 font-display">Popis projektu</h3>
                            <div class="prose prose-lg prose-blue mx-auto text-gray-600 leading-relaxed text-justify lg:text-center">
                                ${item.description || item.desc || '<p>Popis připravujeme...</p>'}
                            </div>
                        </div>

                        <!-- Specs Grid -->
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-5xl mx-auto border-t border-b border-gray-100 py-12">
                            <div class="text-center p-6 hover:bg-gray-50 rounded-2xl transition-colors group">
                                <div class="text-xs text-gray-400 uppercase tracking-widest mb-2 group-hover:text-brand-gold transition-colors">Dispozice</div>
                                <div class="text-3xl font-bold text-brand-blue font-display">${item.specs?.disposition || '-'}</div>
                            </div>
                            <div class="text-center p-6 hover:bg-gray-50 rounded-2xl transition-colors group">
                                <div class="text-xs text-gray-400 uppercase tracking-widest mb-2 group-hover:text-brand-gold transition-colors">Plocha</div>
                                <div class="text-3xl font-bold text-brand-blue font-display">${item.specs?.area || '-'}</div>
                            </div>
                            <div class="text-center p-6 hover:bg-gray-50 rounded-2xl transition-colors group">
                                <div class="text-xs text-gray-400 uppercase tracking-widest mb-2 group-hover:text-brand-gold transition-colors">Podlaží</div>
                                <div class="text-3xl font-bold text-brand-blue font-display">${item.specs?.floor || '-'}</div>
                            </div>
                            <div class="text-center p-6 hover:bg-gray-50 rounded-2xl transition-colors group">
                                <div class="text-xs text-gray-400 uppercase tracking-widest mb-2 group-hover:text-brand-gold transition-colors">PENB</div>
                                <div class="text-3xl font-bold text-brand-blue font-display">${item.penb || item.specs?.penb || '-'}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 3. GALLERY SECTION (Dark) -->
                <div class="bg-brand-blue py-32 text-white relative overflow-hidden">
                    <div class="absolute inset-0 opacity-5 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
                    <div class="container mx-auto px-6 lg:px-12 relative z-10">
                        <div class="text-center mb-20">
                            <h2 class="text-brand-gold font-bold uppercase tracking-widest text-sm mb-4">Fotogalerie</h2>
                            <h3 class="text-4xl lg:text-5xl font-bold font-display">Vizuální prohlídka</h3>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            ${gallery}
                        </div>
                    </div>
                </div>

                <!-- 4. UNITS TABLE -->
                ${units}

                <!-- 5. MAP SECTION -->
                ${item.map_url ? `
                <div class="w-full h-[600px] relative group bg-gray-200">
                    <iframe src="${item.map_url}" width="100%" height="100%" style="border:0; filter: grayscale(100%); transition: filter 0.5s;" allowfullscreen="" loading="lazy" class="group-hover:grayscale-0"></iframe>
                    <div class="absolute top-10 left-10 bg-white/90 backdrop-blur-md px-8 py-4 rounded-2xl shadow-2xl pointer-events-none">
                        <span class="text-brand-blue font-bold flex items-center text-lg">
                            <svg class="w-6 h-6 mr-3 text-brand-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                            Lokalita
                        </span>
                    </div>
                </div>` : ''}

                <!-- 6. CONTACT SECTION -->
                <div class="bg-white py-24">
                    <div class="container mx-auto px-6 lg:px-12 grid lg:grid-cols-2 gap-16 items-center">
                        <div class="order-2 lg:order-1 relative">
                            <div class="absolute -top-10 -left-10 w-24 h-24 bg-brand-gold/10 rounded-full blur-xl"></div>
                            <div class="relative bg-white p-10 rounded-3xl shadow-2xl border border-gray-100 text-center">
                                <img src="${document.querySelector('[data-key=main_photo]')?.src || ''}" class="w-32 h-32 rounded-full mx-auto mb-6 object-cover border-4 border-brand-gold shadow-md">
                                <h3 class="text-2xl font-bold text-brand-blue mb-2">
                                    <span data-editable="true" data-section="profile" data-key="first_name">Jan</span>
                                    <span data-editable="true" data-section="profile" data-key="last_name">Novák</span>
                                </h3>
                                <p class="text-gray-500 uppercase tracking-widest text-sm mb-8">Váš realitní partner</p>
                                <div class="space-y-4">
                                    <a href="#" class="block bg-brand-blue text-white font-bold py-4 rounded-xl hover:bg-brand-gold transition-colors shadow-lg transform hover:-translate-y-1">Zavolat makléři</a>
                                    <a href="#kontakt" class="block bg-white border-2 border-brand-blue text-brand-blue font-bold py-4 rounded-xl hover:bg-brand-blue hover:text-white transition-colors">Napsat email</a>
                                </div>
                            </div>
                        </div>
                        <div class="order-1 lg:order-2 space-y-8">
                            <h2 class="text-4xl lg:text-5xl font-bold text-brand-blue leading-tight font-display">Zaujala vás tato<br><span class="text-brand-gold">exkluzivní nabídka?</span></h2>
                            <p class="text-lg text-gray-600 leading-relaxed">Domluvte si soukromou prohlídku ještě dnes. Rád vám nemovitost osobně představím a probereme všechny detaily u dobré kávy.</p>
                        </div>
                    </div>
                </div>
            </div>`;

        container.innerHTML = html;
        window.scrollTo(0, 0);

        // 6. Refresh Dynamic Content (Universal Editor)
        if (window.UniversalEditor && typeof window.UniversalEditor.fetchAndApplyContent === 'function') {
            window.UniversalEditor.fetchAndApplyContent();
            setTimeout(() => window.UniversalEditor.renderEditIcons(), 500);
        }
    }
};
window.openLegalModal = async function (type) {
    const modal = document.getElementById('legal-modal');
    const titleEl = document.getElementById('legal-modal-title');
    const contentEl = document.getElementById('legal-modal-content');

    if (!modal) return;

    const titles = {
        'vop': 'Obchodní podmínky',
        'gdpr': 'Ochrana osobních údajů',
        'aml': 'AML Pravidla'
    };

    if (titleEl) titleEl.innerText = titles[type] || 'Dokument';
    if (contentEl) contentEl.innerHTML = '<div class="text-center py-8"><div class="inline-block w-8 h-8 border-4 border-brand-blue border-t-transparent rounded-full animate-spin"></div></div>';

    modal.classList.remove('hidden');

    if (!window.supabaseClient) {
        if (contentEl) contentEl.innerHTML = '<div class="text-red-500">Chyba: Databáze nedostupná.</div>';
        return;
    }

    try {
        const { data, error } = await window.supabaseClient
            .from('legal_texts')
            .select('content_text')
            .eq('section_type', type)
            .single();

        if (data && data.content_text) {
            // Simple basic formatting
            contentEl.innerHTML = data.content_text.split('\n').map(line => `<p class="mb-2">${line}</p>`).join('');
        } else {
            contentEl.innerHTML = '<div class="text-gray-500 italic">Text pro tuto sekci nebyl zatím nahrán.</div>';
        }
    } catch (e) {
        console.error(e);
        if (contentEl) contentEl.innerHTML = '<div class="text-red-500">Chyba při načítání.</div>';
    }
};

window.closeAddPropertyModal = function () {
    const modal = document.getElementById('add-property-modal');
    if (modal) modal.classList.add('hidden');
    // Also reset any hash if needed, but primary job is specific
};

// 8. PROPERTY MANAGER (Form Logic)
window.addUnitRow = function () {
    const container = document.getElementById('units-rows-container');
    if (!container) return;

    const rowId = 'unit-' + Date.now();
    const html = `
        <div id="${rowId}" class="grid grid-cols-12 gap-2 items-center bg-white p-2 rounded shadow-sm border border-gray-100 relative group unit-row">
            <div class="col-span-2"><input type="text" class="unit-input-id w-full border p-1 rounded text-sm font-bold text-brand-blue" placeholder="2.01"></div>
            <div class="col-span-2"><input type="text" class="unit-input-disposition w-full border p-1 rounded text-sm" placeholder="3+kk"></div>
            <div class="col-span-2"><input type="text" class="unit-input-area w-full border p-1 rounded text-sm" placeholder="85 m²"></div>
            <div class="col-span-1"><input type="text" class="unit-input-floor w-full border p-1 rounded text-sm" placeholder="2"></div>
            <div class="col-span-2"><input type="text" class="unit-input-price w-full border p-1 rounded text-sm font-bold text-brand-gold" placeholder="8.500.000 Kč"></div>
            <div class="col-span-2">
                <select class="unit-input-status w-full border p-1 rounded text-xs font-bold uppercase">
                    <option value="Volné" class="text-green-600">Volné</option>
                    <option value="Rezervováno" class="text-orange-500">Rezervováno</option>
                    <option value="Prodáno" class="text-red-500">Prodáno</option>
                </select>
            </div>
            <div class="col-span-1 text-center">
                <button onclick="document.getElementById('${rowId}').remove()" class="text-gray-300 hover:text-red-500 transition-colors" title="Odstranit">
                    ✖
                </button>
            </div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
};

window.serializeUnits = function () {
    const rows = document.querySelectorAll('#units-rows-container > .unit-row');
    const data = [];
    rows.forEach(row => {
        // Robust selection using classes
        const getVal = (cls) => {
            const el = row.querySelector('.' + cls);
            return el ? el.value.trim() : '';
        };

        const item = {
            id: getVal('unit-input-id'),
            disposition: getVal('unit-input-disposition'),
            area: getVal('unit-input-area'),
            floor: getVal('unit-input-floor'),
            price: getVal('unit-input-price'),
            status: getVal('unit-input-status')
        };

        // Only add if at least one field is filled (prevent empty ghost rows)
        if (item.id || item.price || item.area) {
            data.push(item);
        }
    });
    console.log("Serialized Units:", data);
    return data;
};

// Stubs for removed Media Section
window.serializeGallery = function () { return []; };
window.addGalleryRow = function () { alert('Galerie se nyní spravuje přes Onboarding Agenta.'); };

// OVERRIDE SAVE PROPERTY
window.saveProperty = async function () {
    console.log("UniversalAdmin: Saving Property...");
    const supabase = window.supabaseClient;
    if (!supabase) { alert("Supabase Error: Backend not connected."); return; }

    // 1. UI Loading
    const btn = document.getElementById('btn-save-property');
    const btnText = document.getElementById('btn-save-text');
    const btnLoader = document.getElementById('btn-save-loader');

    if (btn) {
        btn.disabled = true;
        btn.classList.add('opacity-75', 'cursor-not-allowed');
        if (btnText) btnText.innerText = "UKLÁDÁM...";
        if (btnLoader) btnLoader.classList.remove('hidden');
    }

    try {
        const getVal = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };

        const payload = {
            title: getVal('prop-title'),
            project_tagline: getVal('prop-tagline'),
            price: getVal('prop-price'),
            location: getVal('prop-location'),
            status: getVal('prop-status'),
            main_image: '', // Removed field
            map_url: '',    // Removed field
            description: getVal('prop-desc'),
            gallery_images: [], // Removed field
            units_table: window.serializeUnits(),
            penb: getVal('spec-penb'), // Mapped to top-level column

            // NOTE: 'specs', 'disposition', 'area', 'floor' do not exist in current schema.
            // Values from 'spec-disposition', 'spec-area', 'spec-floor' are effectively dropped for now
            // until schema is updated.
        };

        console.log("Saving Payload:", payload);

        const { error } = await supabase.from('listings').insert([payload]);
        if (error) throw error;

        // Success
        alert('Nemovitost úspěšně uložena!');

        // Reset Form
        document.querySelectorAll('#add-property-modal input, #add-property-modal textarea').forEach(el => el.value = '');
        document.getElementById('units-rows-container').innerHTML = '';

        // Close Modal
        document.getElementById('add-property-modal').classList.add('hidden');

        // Refresh List
        if (window.fetchAndRenderListings) window.fetchAndRenderListings();

    } catch (e) {
        console.error("Save Error:", e);
        alert('Chyba při ukládání: ' + (e.message || e));
    } finally {
        // Reset UI
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('opacity-75', 'cursor-not-allowed');
            if (btnText) btnText.innerText = "ULOŽIT NEMOVITOST";
            if (btnLoader) btnLoader.classList.add('hidden');
        }
    }
};
