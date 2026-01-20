/**
 * ANELA Digital - Universal Admin Editor
 * Handles generic content editing for any section via Supabase.
 */

window.UniversalEditor = {
    isEnabled: false,
    config: null,

    // Config: { supabase: client, contentTable: 'site_content' }
    init: function (config) {
        this.config = config;
        // Ensure config is valid object to prevent null access later
        if (!this.config) this.config = {};

        console.log("Universal Editor: Initialized");
        this.injectModal();
        this.bindEvents();
        // Load content immediately on init (for all users)
        // CHECK if supabase is actually present in config
        if (this.config.supabase) {
            this.fetchAndApplyContent();
        } else {
            console.warn("Universal Editor: Init without Supabase client.");
        }
    },

    // 0. DATA PERSISTENCE: Fetch & Apply
    fetchAndApplyContent: async function () {
        if (!this.config || !this.config.supabase) return;

        console.log("Universal Editor: Fetching content...");
        const { data, error } = await this.config.supabase
            .from('site_content')
            .select('*');

        if (error) {
            console.error("UE Fetch Error:", error);
            return;
        }

        if (data && data.length > 0) {
            console.log(`UE: Found ${data.length} saved items.`);
            data.forEach(item => {
                const elements = document.querySelectorAll(`[data-section="${item.section}"][data-key="${item.key}"]`);
                elements.forEach(el => {
                    this.applyContentToElement(el, item.value);
                });
            });
            // If admin mode is active, we might need to re-render icons if wrappers were blown away (unlikely for innerHTML, but possible)
            if (this.isEnabled) this.renderEditIcons();
        }
    },

    applyContentToElement: function (el, valueJson) {
        if (!valueJson) return;
        const type = el.dataset.type || 'text';
        let val = typeof valueJson === 'object' ? valueJson.text : valueJson;

        // Handle specific table JSON structure if needed
        if (type === 'table' && Array.isArray(valueJson)) val = valueJson;

        try {
            // RULE 0: LINKS (A) -> .href
            if (el.tagName === 'A') {
                el.href = val;
            }
            // RULE 1: MEDIA (IMG) -> .src
            else if (el.tagName === 'IMG') {
                el.src = val;
            }
            // RULE 2: VIDEO (IFRAME) -> .src
            else if (el.tagName === 'IFRAME') {
                try {
                    // Basic check: if val is just a YouTube watch URL, try to convert? 
                    // Or assume user saves embed URL? Let's assume embed URL or auto-convert.
                    let embedUrl = val;
                    if (val.includes('watch?v=')) {
                        const videoId = val.split('v=')[1].split('&')[0];
                        embedUrl = `https://www.youtube.com/embed/${videoId}`;
                    }
                    el.src = embedUrl;
                } catch (e) { console.warn("Iframe update error", e); }
            }
            // RULE 3: BACKGROUND (Div with bg)
            else if (type === 'background') {
                el.style.backgroundImage = `url('${val}')`;
            }
            // RULE 4: VIDEO (Container Div) - Legacy support if they tagged a div
            else if (type === 'video' && el.tagName === 'DIV') {
                el.dataset.videoUrl = val;
                let embedUrl = '';
                if (val.includes('youtube.com') || val.includes('youtu.be')) {
                    const videoId = val.split('v=')[1] || val.split('/').pop();
                    const cleanId = videoId ? videoId.split('&')[0] : '';
                    if (cleanId) embedUrl = `https://www.youtube.com/embed/${cleanId}`;
                }
                if (embedUrl) {
                    el.innerHTML = `<iframe class="w-full h-full" src="${embedUrl}" title="Video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
                }
            }
            // RULE 5: RAW HTML / TEXT
            else {
                if (type === 'table') {
                    el.dataset.json = JSON.stringify(val);
                    if (el.tagName === 'UL' || el.tagName === 'DIV') {
                        el.innerHTML = val.map(v => `<div><b>${v.Label || Object.values(v)[0]}:</b> ${v.Value || Object.values(v)[1]}</div>`).join('');
                    }
                } else {
                    el.innerHTML = val;
                }
            }
        } catch (err) {
            console.warn("Error applying content to element:", el, err);
        }
    },

    toggleMode: function (active) {
        this.isEnabled = active;
        if (active) {
            document.body.classList.add('admin-mode');
            this.renderEditIcons();
        } else {
            document.body.classList.remove('admin-mode');
            this.removeEditIcons();
        }
    },

    // 1. UI: Floating Edit Icons (With Image Wrapping)
    renderEditIcons: function () {
        const editables = document.querySelectorAll('[data-editable="true"]');
        editables.forEach(el => {
            // Check if already processed (either has pencil or is a wrapper)
            if (el.classList.contains('ue-wrapped') || el.querySelector('.edit-pencil')) return;

            const type = el.dataset.type || 'text';
            let targetForPencil = el;

            // IMAGE / IFRAME FIX: Wrap in relative div
            if (el.tagName === 'IMG' || el.tagName === 'IFRAME') {
                // Create Wrapper
                const wrapper = document.createElement('div');
                wrapper.className = 'ue-wrapper relative group/admin inline-block'; // Inline-block usually best for imgs

                // Copy styles/classes that might affect layout? 
                // A bit risky, but 'w-full' etc should be on wrapper often.
                // For now, let's just make sure wrapper fits content.
                if (el.classList.contains('w-full')) wrapper.classList.add('w-full');
                if (el.classList.contains('h-full')) wrapper.classList.add('h-full');

                // Insert Wrapper
                el.parentNode.insertBefore(wrapper, el);
                wrapper.appendChild(el);

                // Mark el as processed so we don't wrap again
                el.classList.add('ue-wrapped');

                targetForPencil = wrapper;
            } else {
                el.classList.add('relative', 'group/admin');
            }

            // check again if pencil exists in target
            if (targetForPencil.querySelector('.edit-pencil')) return;

            // Edit Pencil
            const pencil = document.createElement('div');
            pencil.className = 'edit-pencil';
            pencil.innerText = 'âśŽ';
            // Force high Z-Index
            pencil.style.zIndex = '99999';

            pencil.onclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.openEditModal(el); // Pass the ORIGINAL element (el), not wrapper
            };

            targetForPencil.appendChild(pencil);
        });
    },

    removeEditIcons: function () {
        document.querySelectorAll('.edit-pencil').forEach(b => b.remove());
        // Optional: Unwrap images? Probably too complex/risky to do repeatedly. 
        // Leaving wrappers is safer for layout stability during session.
    },

    // 2. Logic: Open Modal & Bind Data
    openEditModal: function (element) {
        const section = element.dataset.section;
        const key = element.dataset.key;
        const type = element.dataset.type || 'text'; // text, image, json-table
        const currentVal = element.dataset.value || (type === 'image' ? element.src : element.innerHTML);

        document.getElementById('univ-modal').classList.remove('hidden');
        document.getElementById('univ-modal-title').innerText = `Edit: ${key} (${section})`;

        // Setup Inputs
        const container = document.getElementById('univ-modal-content');
        container.innerHTML = ''; // Clear

        this.currentEdit = { section, key, type, element };
        const isLink = type === 'link' || element.tagName === 'A';

        if (isLink) {
            const currentHref = element.getAttribute('href') || '#';
            container.innerHTML = `
                <label class="block text-xs font-bold uppercase text-gray-500 mb-1">Link URL (href)</label>
                <input type="text" id="univ-input-main" value="${currentHref}" class="w-full bg-gray-50 border border-gray-200 rounded p-3 text-brand-blue">
                <p class="text-xs text-gray-400 mt-2">Enter the destination URL (e.g. #contact, https://example.com)</p>
             `;
        } else if (type === 'text' || type === 'html') {
            container.innerHTML = `
                <label class="block text-xs font-bold uppercase text-gray-500 mb-1">Content</label>
                <textarea id="univ-input-main" rows="6" class="w-full bg-gray-50 border border-gray-200 rounded p-3 text-black">${element.innerHTML.trim()}</textarea>
            `;
        } else if (type === 'image' || type === 'background') {
            const isBg = type === 'background';
            // For BG, try to get existing from style
            let initialUrl = currentVal;
            if (isBg && !initialUrl) {
                const bgStyle = element.style.backgroundImage;
                if (bgStyle) initialUrl = bgStyle.slice(5, -2).replace(/['"]/g, "");
            }
            if (!isBg && element.src) initialUrl = element.src;

            container.innerHTML = `
                <div class="mb-4">
                    <label class="block text-xs font-bold uppercase text-gray-500 mb-1">Upload File</label>
                    <input type="file" id="univ-file-input" class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-blue file:text-white hover:file:bg-brand-gold cursor-pointer transition-colors">
                    <div id="univ-upload-status" class="text-xs text-brand-gold mt-1 hidden font-bold">Uploading...</div>
                </div>

                <div class="mb-4 text-center text-xs text-gray-400 font-bold uppercase">- OR -</div>

                <label class="block text-xs font-bold uppercase text-gray-500 mb-1">${isBg ? 'Background' : 'Image'} URL</label>
                <input type="text" id="univ-input-main" value="${initialUrl || ''}" class="w-full bg-gray-50 border border-gray-200 rounded p-3 text-brand-blue">
                
                <div class="mt-4 rounded-xl overflow-hidden h-48 bg-gray-100 flex items-center justify-center relative">
                    <img id="univ-preview-img" src="${initialUrl || ''}" class="w-full h-full object-cover opacity-50">
                    ${isBg ? '<span class="absolute bg-black/50 text-white px-2 py-1 text-xs rounded">Background Preview</span>' : ''}
                </div>
            `;

            // File Upload Listener
            const fileInput = document.getElementById('univ-file-input');
            const statusMsg = document.getElementById('univ-upload-status');
            const urlInput = document.getElementById('univ-input-main');
            const preview = document.getElementById('univ-preview-img');

            // File Upload Listener - Arrow function for 'this' context
            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                if (!this.config || !this.config.supabase) {
                    alert("Supabase not configured for uploads within Universal Editor.");
                    return;
                }

                statusMsg.classList.remove('hidden');
                statusMsg.innerText = "Uploading to Supabase...";
                fileInput.disabled = true;

                try {
                    const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '-')}`;
                    // Use standard storage bucket text
                    const { data, error } = await this.config.supabase.storage
                        .from('property-images')
                        .upload(fileName, file);

                    if (error) throw error;

                    const { data: { publicUrl } } = this.config.supabase.storage
                        .from('property-images')
                        .getPublicUrl(fileName);

                    urlInput.value = publicUrl;
                    preview.src = publicUrl;
                    statusMsg.innerText = "Upload Complete!";
                    statusMsg.classList.remove('text-brand-gold');
                    statusMsg.classList.add('text-green-600');

                } catch (err) {
                    console.error("Upload Error:", err);
                    statusMsg.innerText = "Upload Failed: " + err.message;
                    statusMsg.classList.add('text-red-500');
                } finally {
                    fileInput.disabled = false;
                }
            });

            urlInput.addEventListener('input', (e) => {
                preview.src = e.target.value;
            });

        } else if (type === 'video') {
            container.innerHTML = `
                <label class="block text-xs font-bold uppercase text-gray-500 mb-1">YouTube / Vimeo URL</label>
                <input type="text" id="univ-input-main" value="${element.dataset.videoUrl || ''}" class="w-full bg-gray-50 border border-gray-200 rounded p-3 text-brand-blue" placeholder="https://www.youtube.com/watch?v=...">
                <div class="mt-4 rounded-xl overflow-hidden h-48 bg-gray-100 flex items-center justify-center">
                    <iframe id="univ-preview-video" class="w-full h-full" src="" frameborder="0" allowfullscreen></iframe>
                </div>
            `;
            const input = document.getElementById('univ-input-main');
            const preview = document.getElementById('univ-preview-video');

            const updatePreview = (url) => {
                let embedUrl = '';
                if (url.includes('youtube.com') || url.includes('youtu.be')) {
                    const videoId = url.split('v=')[1] || url.split('/').pop();
                    const cleanId = videoId ? videoId.split('&')[0] : '';
                    if (cleanId) embedUrl = `https://www.youtube.com/embed/${cleanId}`;
                }
                preview.src = embedUrl;
            };

            if (input.value) updatePreview(input.value);
            input.addEventListener('input', (e) => updatePreview(e.target.value));

        } else if (type === 'table') {
            let data = [];
            try { data = JSON.parse(element.dataset.json || '[]'); } catch (e) { }

            container.innerHTML = `
                <div id="univ-table-builder"></div>
                <button onclick="UniversalEditor.addTableRow()" class="mt-4 w-full py-2 border-2 border-dashed border-gray-300 rounded text-gray-500 hover:text-brand-blue font-bold text-sm">+ Add Row</button>
            `;
            this.renderTableBuilder(data);
        }
    },

    // 3. Generic Table Builder (Mini-Table)
    renderTableBuilder: function (data) {
        const container = document.getElementById('univ-table-builder');
        container.innerHTML = '';

        data.forEach((row, index) => {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'flex gap-2 mb-2 items-center';

            const keys = Object.keys(row).length > 0 ? Object.keys(row) : ['Label', 'Value'];

            let html = '';
            keys.forEach(k => {
                html += `<input type="text" data-k="${k}" value="${row[k] || ''}" class="univ-tbl-input flex-1 bg-white border border-gray-200 rounded p-2 text-sm" placeholder="${k}">`;
            });

            html += `<button onclick="this.parentElement.remove()" class="text-red-400 hover:text-red-600 px-2">&times;</button>`;
            rowDiv.innerHTML = html;
            container.appendChild(rowDiv);
        });
    },

    addTableRow: function () {
        const container = document.getElementById('univ-table-builder');
        const rowDiv = document.createElement('div');
        rowDiv.className = 'flex gap-2 mb-2 items-center';
        rowDiv.innerHTML = `
             <input type="text" data-k="Label" class="univ-tbl-input flex-1 bg-white border border-gray-200 rounded p-2 text-sm" placeholder="Label">
             <input type="text" data-k="Value" class="univ-tbl-input flex-1 bg-white border border-gray-200 rounded p-2 text-sm" placeholder="Value">
             <button onclick="this.parentElement.remove()" class="text-red-400 hover:text-red-600 px-2">&times;</button>
        `;
        container.appendChild(rowDiv);
    },

    // 4. Save Logic (Enhanced)
    save: async function () {
        const { section, key, type, element } = this.currentEdit;
        let value = null;

        if (type === 'table') {
            const rows = document.querySelectorAll('#univ-table-builder > div');
            value = [];
            rows.forEach(r => {
                const inputs = r.querySelectorAll('.univ-tbl-input');
                let obj = {};
                inputs.forEach(inp => obj[inp.dataset.k] = inp.value);
                value.push(obj);
            });
            // Immediately apply to DOM
            this.applyContentToElement(element, value);

        } else {
            value = document.getElementById('univ-input-main').value;
            // Immediately apply to DOM
            this.applyContentToElement(element, value);
        }

        // Supabase Upsert
        if (this.config && this.config.supabase) {
            // Correct payload: use 'value' col, remove 'updated_at' if not in schema
            const payload = { section, key, value: type === 'table' ? value : { text: value } };

            // Show saving state (optional, or just toast)
            if (window.showToast) window.showToast("Saving...");

            const { error } = await this.config.supabase
                .from('site_content')
                .upsert(payload, { onConflict: 'section,key' });

            if (error) {
                alert("Save Error: " + error.message);
            } else {
                if (window.showToast) window.showToast("Saved Successfully!");
                this.closeModal();
                // RE-TRIGGER UI STATE ENFORCEMENT
                if (this.isEnabled) {
                    document.body.classList.add('admin-mode');
                    // Small delay to ensure any DOM shifts settle
                    setTimeout(() => this.renderEditIcons(), 50);
                }
            }
        } else {
            console.warn("UniversalEditor: Supabase not config, local only");
            this.closeModal();
        }
    },

    closeModal: function () {
        document.getElementById('univ-modal').classList.add('hidden');
    },

    injectModal: function () {
        if (document.getElementById('univ-modal')) return;
        const html = `
        <div id="univ-modal" class="fixed inset-0 bg-black/80 z-[300] hidden flex items-center justify-center backdrop-blur-sm">
            <div class="bg-white rounded-2xl w-full max-w-2xl shadow-2xl m-4 flex flex-col">
                <div class="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h3 id="univ-modal-title" class="text-xl font-bold text-brand-blue">Edit Content</h3>
                    <button onclick="UniversalEditor.closeModal()" class="text-gray-400 font-bold text-2xl hover:text-red-500">&times;</button>
                </div>
                <div id="univ-modal-content" class="p-6 overflow-y-auto max-h-[60vh]"></div>
                <div class="p-6 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex justify-end">
                     <button onclick="UniversalEditor.save()" class="bg-brand-blue text-white font-bold py-2 px-6 rounded hover:bg-brand-gold transition-colors">SAVE CHANGES</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    },

    bindEvents: function () {
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeModal();
        });
    }
};
/**
 * ANELA Digital - Dynamic Admin Form Builder
 * Moves logic out of index.html for cleaner architecture.
 */
window.AdminFormBuilder = {
    // Gallery Logic
    addGalleryRow: function (value = '') {
        const container = document.getElementById('gallery-rows-container');
        if (!container) return;
        const div = document.createElement('div');
        div.className = 'flex gap-2 animate-fade-in mb-2';
        div.innerHTML = `
            <input type="text" class="gallery-url flex-1 bg-white border border-gray-200 rounded p-2 text-sm focus:border-brand-gold outline-none" placeholder="https://..." value="${value}">
            <button onclick="this.parentElement.remove()" class="text-gray-400 hover:text-red-500 p-2 rounded hover:bg-red-50 transition-colors">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
        `;
        container.appendChild(div);
    },

    // Unit Logic
    addUnitRow: function (data = {}) {
        const container = document.getElementById('units-rows-container');
        if (!container) return;
        const div = document.createElement('div');
        div.className = 'grid grid-cols-12 gap-2 items-center animate-fade-in border-b border-gray-100 last:border-0 pb-2 last:pb-0 mb-2 last:mb-0';
        div.innerHTML = `
            <div class="col-span-2"><input type="text" class="unit-id w-full bg-white border border-gray-200 rounded p-1 text-xs font-bold" placeholder="A.101" value="${data.id || ''}"></div>
            <div class="col-span-2"><input type="text" class="unit-layout w-full bg-white border border-gray-200 rounded p-1 text-xs" placeholder="2+kk" value="${data.layout || ''}"></div>
            <div class="col-span-2"><input type="text" class="unit-area w-full bg-white border border-gray-200 rounded p-1 text-xs" placeholder="60" value="${data.area || ''}"></div>
            <div class="col-span-1"><input type="text" class="unit-floor w-full bg-white border border-gray-200 rounded p-1 text-xs" placeholder="2" value="${data.floor || ''}"></div>
            <div class="col-span-2"><input type="text" class="unit-price w-full bg-white border border-gray-200 rounded p-1 text-xs font-bold text-gray-700" placeholder="15 000 000" value="${data.price || ''}"></div>
            <div class="col-span-2">
                    <select class="unit-status w-full bg-white border border-gray-200 rounded p-1 text-xs">
                    <option value="VolnĂ˝" ${data.status === 'VolnĂ˝' ? 'selected' : ''}>VolnĂ˝</option>
                    <option value="Rezervace" ${data.status === 'Rezervace' ? 'selected' : ''}>Rezervace</option>
                    <option value="ProdĂˇno" ${data.status === 'ProdĂˇno' ? 'selected' : ''}>ProdĂˇno</option>
                </select>
            </div>
            <div class="col-span-1 text-center">
                <button onclick="this.closest('div.grid').remove()" class="text-gray-400 hover:text-red-500 transition-colors">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </div>
        `;
        container.appendChild(div);
    },

    serializeGallery: function () {
        return Array.from(document.querySelectorAll('.gallery-url'))
            .map(input => input.value.trim())
            .filter(val => val.length > 0);
    },

    serializeUnits: function () {
        return Array.from(document.querySelectorAll('#units-rows-container > div')).map(row => ({
            id: row.querySelector('.unit-id').value,
            layout: row.querySelector('.unit-layout').value,
            area: row.querySelector('.unit-area').value,
            floor: row.querySelector('.unit-floor').value,
            price: row.querySelector('.unit-price').value,
            status: row.querySelector('.unit-status').value
        })).filter(u => u.id || u.price);
    }
};

// Expose globals for onclick events in HTML
window.addGalleryRow = window.AdminFormBuilder.addGalleryRow;
window.addUnitRow = window.AdminFormBuilder.addUnitRow;


/**
 * ANELA Digital - Robust App Router
 * Handles hash navigation and state restoration.
 */
window.AppRouter = {
    init: function () {
        window.addEventListener('hashchange', this.handleHashChange.bind(this));
        // Initial Check
        setTimeout(() => this.handleHashChange(), 100);
    },

    handleHashChange: async function () {
        const fullHash = window.location.hash.substring(1);

        // DEFAULT: Home
        if (!fullHash) {
            this.switchView('home-page');
            return;
        }

        const [viewId, queryString] = fullHash.split('?');

        // ROUTE: Property Detail
        if (viewId === 'listing-detail') {
            const urlParams = new URLSearchParams(queryString);
            const id = urlParams.get('id');
            if (id && window.openPropertyDetail) {
                await window.openPropertyDetail(id);
            }
        }
        // ROUTE: Nabidka (Listings)
        else if (viewId === 'nabidka-view') {
            this.switchView('nabidka-view');
            // CRITICAL: Ensure data is fetched if not present or stale
            if (window.fetchAndRenderListings) {
                // We always re-fetch to ensure fresh data on nav
                window.fetchAndRenderListings();
            }
        }
        // GENERIC VIEW
        else if (document.getElementById(viewId) && document.getElementById(viewId).classList.contains('page-view')) {
            this.switchView(viewId);
        }
        // FALLBACK
        else {
            this.switchView('home-page');
        }
    },

    switchView: function (viewId) {
        // Hide overlay views (property detail)
        const propDetail = document.getElementById('property-detail');
        if (propDetail) {
            propDetail.classList.add('hidden');
            propDetail.style.display = 'none'; // Force hide
        }

        const views = document.querySelectorAll('.page-view');
        const target = document.getElementById(viewId);

        if (target) {
            views.forEach(v => {
                v.classList.remove('page-active');
                v.classList.add('page-hidden');
            });
            target.classList.remove('page-hidden');
            target.classList.add('page-active');

            // Scroll top
            window.scrollTo(0, 0);

            // ADMIN BUTTON VISIBILITY LOGIC
            const adminOverlay = document.getElementById('admin-overlay');
            if (adminOverlay && window.UniversalEditor && window.UniversalEditor.isEnabled) {
                if (viewId === 'nabidka-view') {
                    adminOverlay.classList.remove('hidden');
                } else {
                    adminOverlay.classList.add('hidden');
                }
            }
        }
    }
};

// Auto-Init Router
window.AppRouter.init();


/**
 * ANELA Digital - Admin Tab Switcher
 */
window.switchAdminTab = function (tabName) {
    // Buttons
    const btnProps = document.getElementById('tab-btn-properties');
    const btnLegal = document.getElementById('tab-btn-legal');
    const btnArticles = document.getElementById('tab-btn-articles');

    // Content Areas
    const tabProps = document.getElementById('admin-tab-properties');
    const tabLegal = document.getElementById('admin-tab-legal');
    const tabArticles = document.getElementById('admin-tab-articles');

    if (!btnProps || !btnLegal || !btnArticles) return;

    // Reset All
    [btnProps, btnLegal, btnArticles].forEach(b => {
        b.classList.remove('border-brand-gold', 'text-brand-blue');
        b.classList.add('border-transparent', 'text-gray-400');
    });
    [tabProps, tabLegal, tabArticles].forEach(t => t && t.classList.add('hidden'));

    // Activate Specific
    if (tabName === 'properties') {
        btnProps.classList.add('border-brand-gold', 'text-brand-blue');
        btnProps.classList.remove('border-transparent', 'text-gray-400');
        tabProps.classList.remove('hidden');
    } else if (tabName === 'legal') {
        btnLegal.classList.add('border-brand-gold', 'text-brand-blue');
        btnLegal.classList.remove('border-transparent', 'text-gray-400');
        tabLegal.classList.remove('hidden');
        if (window.LegalManager) window.LegalManager.init();
    } else if (tabName === 'articles') {
        btnArticles.classList.add('border-brand-gold', 'text-brand-blue');
        btnArticles.classList.remove('border-transparent', 'text-gray-400');
        if (tabArticles) tabArticles.classList.remove('hidden');
        if (window.BlogManager) window.BlogManager.fetchForAdmin();
    }
};

/**
 * ANELA Digital - Legal Settings Manager
 * Handles VOP, GDPR, AML fetching and saving.
 */
window.LegalManager = {
    cache: {},

    init: async function () {
        if (this.initialized) return;
        console.log("LegalManager: Fetching texts...");

        try {
            const { data, error } = await window.supabaseClient
                .from('legal_texts')
                .select('*');

            if (error) throw error;

            if (data) {
                data.forEach(item => {
                    const cleanContent = item.content || '';
                    this.cache[item.section_type] = cleanContent;
                    const el = document.getElementById(`legal-${item.section_type}`);
                    if (el) el.value = cleanContent;
                });
            }
            this.initialized = true;
        } catch (e) {
            console.error("LegalManager Init Error:", e);
        }
    },

    saveLegal: async function (type) {
        const el = document.getElementById(`legal-${type}`);
        if (!el) return;
        const content = el.value.trim();

        const btn = el.nextElementSibling;
        const originalText = btn.innerText;
        btn.innerText = "UklĂˇdĂˇm...";
        btn.disabled = true;

        try {
            const payload = {
                section_type: type,
                content: content,
                updated_at: new Date().toISOString(),
                is_active: true // Ensure it stays active
            };

            const { error } = await window.supabaseClient
                .from('legal_texts')
                .upsert(payload, { onConflict: 'section_type' });

            if (error) throw error;

            this.cache[type] = content; // Update cache

            // Premium Feedback
            if (window.showToast) {
                window.showToast(`Dokument ${type.toUpperCase()} ĂşspÄ›ĹˇnÄ› uloĹľen`);
            } else {
                alert('UloĹľeno!');
            }
        } catch (e) {
            console.error("Save Error:", e);
            alert('Chyba pĹ™i uklĂˇdĂˇnĂ­: ' + e.message);
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    },

    getLegal: async function (type) {
        // Check cache first
        if (this.cache[type]) return this.cache[type];

        // Fetch single if needed
        const { data, error } = await window.supabaseClient
            .from('legal_texts')
            .select('content')
            .eq('section_type', type)
            .single();

        if (data) {
            this.cache[type] = data.content;
            return data.content;
        }
        return null;
    }
};

/**
 * PUBLIC: Open Legal Modal
 */
window.openLegalModal = async function (type) {
    const modal = document.getElementById('legal-modal');
    const title = document.getElementById('legal-modal-title');
    const content = document.getElementById('legal-modal-content');

    if (!modal || !title || !content) return;

    // Reset
    content.innerHTML = '<div class="text-center py-12 text-gray-500 animate-pulse">NaÄŤĂ­tĂˇm dokument...</div>';
    modal.classList.remove('hidden');

    // Title Map
    const titles = {
        'vop': 'ObchodnĂ­ podmĂ­nky',
        'gdpr': 'Ochrana osobnĂ­ch ĂşdajĹŻ',
        'aml': 'Pravidla AML'
    };
    title.innerText = titles[type] || 'PrĂˇvnĂ­ dokument';

    // Fetch Content
    let text = null;
    if (window.LegalManager) {
        text = await window.LegalManager.getLegal(type);
    }

    // Default Templates (Fallback)
    if (!text) {
        const defaults = {
            'gdpr': `
                <h3 class="text-xl font-bold mb-4">ZĂˇsady zpracovĂˇnĂ­ osobnĂ­ch ĂşdajĹŻ</h3>
                <p class="mb-4">SprĂˇvcem vaĹˇich osobnĂ­ch ĂşdajĹŻ je <strong>[DOPLNIT JMĂ‰NO/FIRMU MAKLEĹE]</strong>, IÄŚO: [DOPLNIT IÄŚO]. VaĹˇe Ăşdaje (jmĂ©no, e-mail, telefon) zpracovĂˇvĂˇm vĂ˝hradnÄ› za ĂşÄŤelem vyĹ™Ă­zenĂ­ vaĹˇĂ­ poptĂˇvky po nemovitosti nebo poskytnutĂ­ realitnĂ­ch sluĹľeb.</p>
                <h4 class="font-bold mb-2">ProÄŤ Ăşdaje zpracovĂˇvĂˇm?</h4>
                <ul class="list-disc pl-5 mb-4">
                    <li>Pro komunikaci s vĂˇmi ohlednÄ› vybranĂ© nemovitosti.</li>
                    <li>Pro zasĂ­lĂˇnĂ­ nabĂ­dek, o kterĂ© jste projevili zĂˇjem.</li>
                </ul>
                <p>VaĹˇe data jsou uloĹľena v zabezpeÄŤenĂ© databĂˇzi na platformÄ› Supabase a nejsou poskytovĂˇna tĹ™etĂ­m stranĂˇm bez vaĹˇeho souhlasu, s vĂ˝jimkou zĂˇkonnĂ˝ch povinnostĂ­. MĂˇte prĂˇvo na pĹ™Ă­stup k ĂşdajĹŻm, jejich opravÄ› ÄŤi vymazĂˇnĂ­.</p>
            `,
            'aml': `
                <h3 class="text-xl font-bold mb-4">Informace o plnÄ›nĂ­ povinnostĂ­ dle AML zĂˇkona</h3>
                <p class="mb-4">Jako realitnĂ­ zprostĹ™edkovatel jsem â€žpovinnou osobouâ€ś dle zĂˇkona ÄŤ. 253/2008 Sb., o nÄ›kterĂ˝ch opatĹ™enĂ­ch proti legalizaci vĂ˝nosĹŻ z trestnĂ© ÄŤinnosti a financovĂˇnĂ­ terorismu (tzv. AML zĂˇkon).</p>
                <p>V rĂˇmci uzavĂ­rĂˇnĂ­ obchodnĂ­ch vztahĹŻ jsem povinen provĂˇdÄ›t identifikaci a kontrolu klienta. K tomuto ĂşÄŤelu jsem oprĂˇvnÄ›n a povinen zjiĹˇĹĄovat a uchovĂˇvat vaĹˇe osobnĂ­ Ăşdaje a poĹ™izovat kopie prĹŻkazĹŻ totoĹľnosti v rozsahu stanovenĂ©m zĂˇkonem. VeĹˇkerĂ© informace jsou zpracovĂˇvĂˇny v pĹ™Ă­snĂ©m reĹľimu dĹŻvÄ›rnosti.</p>
            `,
            'vop': `
                <h3 class="text-xl font-bold mb-4">VĹˇeobecnĂ© obchodnĂ­ podmĂ­nky</h3>
                <p class="mb-4">Tyto podmĂ­nky upravujĂ­ uĹľĂ­vĂˇnĂ­ webovĂ˝ch strĂˇnek <strong>[DOPLNIT JMĂ‰NO MAKLEĹE]</strong>. VeĹˇkerĂ˝ obsah (texty, fotografie, vizualizace) je chrĂˇnÄ›n autorskĂ˝m prĂˇvem a jeho ĹˇĂ­Ĺ™enĂ­ bez souhlasu je zakĂˇzĂˇno.</p>
                <div class="bg-gray-50 border-l-4 border-brand-gold p-4">
                    <p class="font-bold text-sm mb-1">UpozornÄ›nĂ­</p>
                    <p class="text-sm">Informace o nemovitostech uvedenĂ© na tomto webu majĂ­ informativnĂ­ charakter a nejsou zĂˇvaznĂ˝m nĂˇvrhem na uzavĹ™enĂ­ smlouvy (nabĂ­dkou) ve smyslu Â§ 1732 obÄŤanskĂ©ho zĂˇkonĂ­ku. TechnickĂ© parametry a ceny se mohou mÄ›nit v zĂˇvislosti na aktuĂˇlnosti nabĂ­dky.</p>
                </div>
            `
        };
        text = defaults[type] || '<p class="text-center text-gray-500">Obsah se pĹ™ipravuje...</p>';
    } else {
        // Format existing DB content: Convert newlines to breaks if it's plain text
        if (!text.includes('<p>') && !text.includes('<div>')) {
            text = text.replace(/\n/g, '<br>');
        }
    }

    // Inject Content
    content.innerHTML = text;

    // ADMIN: Add Edit Button if logged in
    const header = modal.querySelector('.border-b'); // Find header container
    // Remove existing edit button if any
    const existingBtn = document.getElementById('btn-edit-legal-deep');
    if (existingBtn) existingBtn.remove();

    if (window.UniversalEditor && window.UniversalEditor.isEnabled) {
        const editBtn = document.createElement('button');
        editBtn.id = 'btn-edit-legal-deep';
        editBtn.className = 'absolute top-20 right-8 text-xs bg-brand-gold text-white px-3 py-1 rounded hover:bg-brand-blue transition-colors shadow-sm font-bold uppercase tracking-wider';
        editBtn.innerText = 'Upravit Text';
        editBtn.onclick = function () {
            window.editLegal(type);
        };
        // Append to relative container
        modal.querySelector('.relative').appendChild(editBtn);
    }
};

/**
 * BRIDGE: Open Admin Portal at Legal Tab
 */
window.editLegal = function (type) {
    // 1. Close View Modal
    document.getElementById('legal-modal').classList.add('hidden');

    // 2. Open Admin Portal
    const adminModal = document.getElementById('add-property-modal');
    if (adminModal) adminModal.classList.remove('hidden');

    // 3. Switch to Legal Tab
    if (window.switchAdminTab) {
        window.switchAdminTab('legal');
    }

    // 4. Focus specific field
    setTimeout(() => {
        const field = document.getElementById(`legal-${type}`);
        if (field) {
            field.focus();
            field.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Highlight
            field.classList.add('ring-2', 'ring-brand-gold');
            setTimeout(() => field.classList.remove('ring-2', 'ring-brand-gold'), 1000);
        }
    }, 300);
};

 
 / * * 
 
   *   B L O G   M A N A G E R 
 
   *   H a n d l e s   f e t c h i n g ,   c r e a t i n g ,   u p d a t i n g ,   a n d   d e l e t i n g   a r t i c l e s   f r o m   ' a r t i c l e s '   t a b l e . 
 
   * / 
 
 w i n d o w . B l o g M a n a g e r   =   { 
 
         a r t i c l e s :   [ ] , 
 
 
 
         / /   1 .   P U B L I C :   F e t c h   a n d   R e n d e r   o n   F r o n t e n d 
 
         i n i t P u b l i c :   a s y n c   f u n c t i o n   ( )   { 
 
                 c o n s t   c o n t a i n e r   =   d o c u m e n t . g e t E l e m e n t B y I d ( ' p u b l i c - b l o g - c o n t a i n e r ' ) ; 
 
                 i f   ( ! c o n t a i n e r )   r e t u r n ; 
 
 
 
                 t r y   { 
 
                         c o n s t   {   d a t a ,   e r r o r   }   =   a w a i t   w i n d o w . s u p a b a s e C l i e n t 
 
                                 . f r o m ( ' a r t i c l e s ' ) 
 
                                 . s e l e c t ( ' * ' ) 
 
                                 . o r d e r ( ' p u b l i s h e d _ a t ' ,   {   a s c e n d i n g :   f a l s e   } ) ; 
 
 
 
                         i f   ( e r r o r )   t h r o w   e r r o r ; 
 
 
 
                         t h i s . a r t i c l e s   =   d a t a   | |   [ ] ; 
 
                         t h i s . r e n d e r P u b l i c G r i d ( ) ; 
 
                 }   c a t c h   ( e )   { 
 
                         c o n s o l e . e r r o r ( " B l o g   F e t c h   E r r o r : " ,   e ) ; 
 
                         c o n t a i n e r . i n n e r H T M L   =   ' < d i v   c l a s s = " t e x t - c e n t e r   t e x t - r e d - 4 0 0 " > N e p o d a 9"!i l o   s e   n a Ä d­ s t   Ä dl Çn k y . < / d i v > ' ; 
 
                 } 
 
         } , 
 
 
 
         r e n d e r P u b l i c G r i d :   f u n c t i o n   ( )   { 
 
                 c o n s t   c o n t a i n e r   =   d o c u m e n t . g e t E l e m e n t B y I d ( ' p u b l i c - b l o g - c o n t a i n e r ' ) ; 
 
                 i f   ( ! c o n t a i n e r )   r e t u r n ; 
 
 
 
                 i f   ( t h i s . a r t i c l e s . l e n g t h   = = =   0 )   { 
 
                         c o n t a i n e r . i n n e r H T M L   =   ' < d i v   c l a s s = " t e x t - c e n t e r   t e x t - g r a y - 4 0 0   p y - 1 2 " > Z a t ­ m   n e b y l y   p u b l i k o v Çn y   9>Çd n ©   Ä dl Çn k y . < / d i v > ' ; 
 
                         r e t u r n ; 
 
                 } 
 
 
 
                 c o n t a i n e r . i n n e r H T M L   =   t h i s . a r t i c l e s . m a p ( a r t i c l e   = >   ` 
 
                         < d i v   c l a s s = " f l e x   f l e x - c o l   m d : f l e x - r o w   g a p - 8   i t e m s - s t a r t   g r o u p " > 
 
                                 < d i v   c l a s s = " w - f u l l   m d : w - 2 / 5   a s p e c t - [ 4 / 3 ]   r o u n d e d - 2 x l   o v e r f l o w - h i d d e n   s h a d o w - l g   r e l a t i v e   b g - g r a y - 1 0 0 " > 
 
                                         < i m g   s r c = " $ { a r t i c l e . i m a g e _ u r l   | |   ' i m g / p l a c e h o l d e r . j p g ' } "   
 
                                                   c l a s s = " w - f u l l   h - f u l l   o b j e c t - c o v e r   t r a n s i t i o n - t r a n s f o r m   d u r a t i o n - 7 0 0   g r o u p - h o v e r : s c a l e - 1 0 5 " 
 
                                                   a l t = " $ { a r t i c l e . t i t l e } " > 
 
                                 < / d i v > 
 
                                 < d i v   c l a s s = " w - f u l l   m d : w - 3 / 5 " > 
 
                                         < d i v   c l a s s = " f l e x   i t e m s - c e n t e r   t e x t - x s   t e x t - g r a y - 4 0 0   m b - 3   s p a c e - x - 4 " > 
 
                                                 < s p a n   c l a s s = " f l e x   i t e m s - c e n t e r " > 
 
                                                         < s v g   c l a s s = " w - 3   h - 3   m r - 1 "   f i l l = " n o n e "   s t r o k e = " c u r r e n t C o l o r "   v i e w B o x = " 0   0   2 4   2 4 " > < p a t h   s t r o k e - l i n e c a p = " r o u n d "   s t r o k e - l i n e j o i n = " r o u n d "   s t r o k e - w i d t h = " 2 "   d = " M 8   7 V 3 m 8   4 V 3 m - 9   8 h 1 0 M 5   2 1 h 1 4 a 2   2   0   0 0 2 - 2 V 7 a 2   2   0   0 0 - 2 - 2 H 5 a 2   2   0   0 0 - 2   2 v 1 2 a 2   2   0   0 0 2   2 z " > < / p a t h > < / s v g >   
 
                                                         $ { n e w   D a t e ( a r t i c l e . p u b l i s h e d _ a t ) . t o L o c a l e D a t e S t r i n g ( ' c s - C Z ' ) } 
 
                                                 < / s p a n > 
 
                                         < / d i v > 
 
                                         < h 3   c l a s s = " t e x t - 2 x l   f o n t - b o l d   t e x t - b r a n d - b l u e   m b - 4   g r o u p - h o v e r : t e x t - b r a n d - g o l d   t r a n s i t i o n - c o l o r s " > 
 
                                                 $ { a r t i c l e . t i t l e } 
 
                                         < / h 3 > 
 
                                         < p   c l a s s = " t e x t - g r a y - 6 0 0   l e a d i n g - r e l a x e d   m b - 6 " > 
 
                                                 $ { a r t i c l e . p r e v i e w _ t e x t   | |   ' ' } 
 
                                         < / p > 
 
                                         < a   h r e f = " $ { a r t i c l e . e x t e r n a l _ u r l   | |   ' # ' } "   t a r g e t = " $ { a r t i c l e . e x t e r n a l _ u r l   ?   ' _ b l a n k '   :   ' _ s e l f ' } " 
 
                                               c l a s s = " i n l i n e - f l e x   i t e m s - c e n t e r   f o n t - b o l d   t e x t - b r a n d - b l u e   h o v e r : t e x t - b r a n d - g o l d   t r a n s i t i o n - c o l o r s " > 
 
                                                 $ { a r t i c l e . e x t e r n a l _ u r l   ?   ' Ä Z­ s t   c e l Ý  Ä dl Çn e k '   :   ' V ­ c e   i n f o   b r z y ' }   
 
                                                 < s v g   c l a s s = " w - 4   h - 4   m l - 2 "   f i l l = " n o n e "   s t r o k e = " c u r r e n t C o l o r "   v i e w B o x = " 0   0   2 4   2 4 " > < p a t h   s t r o k e - l i n e c a p = " r o u n d "   s t r o k e - l i n e j o i n = " r o u n d "   s t r o k e - w i d t h = " 2 "   d = " M 1 7   8 l 4   4 m 0   0 l - 4   4 m 4 - 4 H 3 " > < / p a t h > < / s v g > 
 
                                         < / a > 
 
                                 < / d i v > 
 
                         < / d i v > 
 
                 ` ) . j o i n ( ' ' ) ; 
 
         } , 
 
 
 
         / /   2 .   A D M I N :   F e t c h   f o r   L i s t   V i e w 
 
         f e t c h F o r A d m i n :   a s y n c   f u n c t i o n   ( )   { 
 
                 c o n s t   c o n t a i n e r   =   d o c u m e n t . g e t E l e m e n t B y I d ( ' b l o g - i t e m s - c o n t a i n e r ' ) ; 
 
                 i f   ( ! c o n t a i n e r )   r e t u r n ; 
 
 
 
                 c o n t a i n e r . i n n e r H T M L   =   ' < d i v   c l a s s = " t e x t - c e n t e r   t e x t - g r a y - 4 0 0 " > N a Ä d­ t Çm . . . < / d i v > ' ; 
 
 
 
                 / /   R e - f e t c h   t o   e n s u r e   f r e s h   d a t a 
 
                 a w a i t   t h i s . i n i t P u b l i c ( ) ;   / /   U p d a t e s   t h i s . a r t i c l e s 
 
 
 
                 i f   ( t h i s . a r t i c l e s . l e n g t h   = = =   0 )   { 
 
                         c o n t a i n e r . i n n e r H T M L   =   ' < d i v   c l a s s = " t e x t - c e n t e r   t e x t - g r a y - 4 0 0   p y - 8 " > 9ÝÇd n ©   Ä dl Çn k y .   K l i k n Ä : t e   n a   " P 9"!i d a t   Ä Zl Çn e k " . < / d i v > ' ; 
 
                         r e t u r n ; 
 
                 } 
 
 
 
                 c o n t a i n e r . i n n e r H T M L   =   t h i s . a r t i c l e s . m a p ( a   = >   ` 
 
                         < d i v   c l a s s = " b g - w h i t e   p - 4   r o u n d e d - l g   b o r d e r   b o r d e r - g r a y - 1 0 0   s h a d o w - s m   f l e x   j u s t i f y - b e t w e e n   i t e m s - c e n t e r   h o v e r : s h a d o w - m d   t r a n s i t i o n - s h a d o w " > 
 
                                 < d i v   c l a s s = " f l e x   i t e m s - c e n t e r   g a p - 4 " > 
 
                                         < i m g   s r c = " $ { a . i m a g e _ u r l   | |   ' i m g / p l a c e h o l d e r . j p g ' } "   c l a s s = " w - 1 6   h - 1 6   r o u n d e d   o b j e c t - c o v e r   b g - g r a y - 1 0 0 " > 
 
                                         < d i v > 
 
                                                 < h 5   c l a s s = " f o n t - b o l d   t e x t - b r a n d - b l u e " > $ { a . t i t l e } < / h 5 > 
 
                                                 < p   c l a s s = " t e x t - x s   t e x t - g r a y - 4 0 0 " > $ { n e w   D a t e ( a . p u b l i s h e d _ a t ) . t o L o c a l e D a t e S t r i n g ( ' c s - C Z ' ) } < / p > 
 
                                         < / d i v > 
 
                                 < / d i v > 
 
                                 < d i v   c l a s s = " f l e x   g a p - 2 " > 
 
                                         < b u t t o n   o n c l i c k = " w i n d o w . B l o g M a n a g e r . e d i t ( $ { a . i d } ) "   c l a s s = " p - 2   t e x t - g r a y - 4 0 0   h o v e r : t e x t - b r a n d - b l u e "   t i t l e = " U p r a v i t " > 
 
                                                 < s v g   c l a s s = " w - 5   h - 5 "   f i l l = " n o n e "   s t r o k e = " c u r r e n t C o l o r "   v i e w B o x = " 0   0   2 4   2 4 " > < p a t h   s t r o k e - l i n e c a p = " r o u n d "   s t r o k e - l i n e j o i n = " r o u n d "   s t r o k e - w i d t h = " 2 "   d = " M 1 5 . 2 3 2   5 . 2 3 2 l 3 . 5 3 6   3 . 5 3 6 m - 2 . 0 3 6 - 5 . 0 3 6 a 2 . 5   2 . 5   0   1 1 3 . 5 3 6   3 . 5 3 6 L 6 . 5   2 1 . 0 3 6 H 3 v - 3 . 5 7 2 L 1 6 . 7 3 2   3 . 7 3 2 z " > < / p a t h > < / s v g > 
 
                                         < / b u t t o n > 
 
                                         < b u t t o n   o n c l i c k = " w i n d o w . B l o g M a n a g e r . d e l e t e ( $ { a . i d } ) "   c l a s s = " p - 2   t e x t - g r a y - 4 0 0   h o v e r : t e x t - r e d - 5 0 0 "   t i t l e = " S m a z a t " > 
 
                                                 < s v g   c l a s s = " w - 5   h - 5 "   f i l l = " n o n e "   s t r o k e = " c u r r e n t C o l o r "   v i e w B o x = " 0   0   2 4   2 4 " > < p a t h   s t r o k e - l i n e c a p = " r o u n d "   s t r o k e - l i n e j o i n = " r o u n d "   s t r o k e - w i d t h = " 2 "   d = " M 1 9   7 l - . 8 6 7   1 2 . 1 4 2 A 2   2   0   0 1 1 6 . 1 3 8   2 1 H 7 . 8 6 2 a 2   2   0   0 1 - 1 . 9 9 5 - 1 . 8 5 8 L 5   7 m 5   4 v 6 m 4 - 6 v 6 m 1 - 1 0 V 4 a 1   1   0   0 0 - 1 - 1 h - 4 a 1   1   0   0 0 - 1   1 v 3 M 4   7 h 1 6 " > < / p a t h > < / s v g > 
 
                                         < / b u t t o n > 
 
                                 < / d i v > 
 
                         < / d i v > 
 
                 ` ) . j o i n ( ' ' ) ; 
 
         } , 
 
 
 
         / /   3 .   E D I T O R   A C T I O N S 
 
         o p e n E d i t o r :   f u n c t i o n   ( i d   =   n u l l )   { 
 
                 d o c u m e n t . g e t E l e m e n t B y I d ( ' b l o g - l i s t - v i e w ' ) . c l a s s L i s t . a d d ( ' h i d d e n ' ) ; 
 
                 d o c u m e n t . g e t E l e m e n t B y I d ( ' b l o g - e d i t o r - v i e w ' ) . c l a s s L i s t . r e m o v e ( ' h i d d e n ' ) ; 
 
 
 
                 / /   R e s e t   F o r m 
 
                 d o c u m e n t . g e t E l e m e n t B y I d ( ' b l o g - i d ' ) . v a l u e   =   ' ' ; 
 
                 d o c u m e n t . g e t E l e m e n t B y I d ( ' b l o g - t i t l e ' ) . v a l u e   =   ' ' ; 
 
                 d o c u m e n t . g e t E l e m e n t B y I d ( ' b l o g - d a t e ' ) . v a l u e   =   n e w   D a t e ( ) . t o I S O S t r i n g ( ) . s p l i t ( ' T ' ) [ 0 ] ; 
 
                 d o c u m e n t . g e t E l e m e n t B y I d ( ' b l o g - i m a g e ' ) . v a l u e   =   ' ' ; 
 
                 d o c u m e n t . g e t E l e m e n t B y I d ( ' b l o g - d e s c ' ) . v a l u e   =   ' ' ; 
 
                 d o c u m e n t . g e t E l e m e n t B y I d ( ' b l o g - l i n k ' ) . v a l u e   =   ' ' ; 
 
 
 
                 i f   ( i d )   { 
 
                         / /   F i l l   F o r m 
 
                         c o n s t   a r t i c l e   =   t h i s . a r t i c l e s . f i n d ( a   = >   a . i d   = = =   i d ) ; 
 
                         i f   ( a r t i c l e )   { 
 
                                 d o c u m e n t . g e t E l e m e n t B y I d ( ' b l o g - i d ' ) . v a l u e   =   a r t i c l e . i d ; 
 
                                 d o c u m e n t . g e t E l e m e n t B y I d ( ' b l o g - t i t l e ' ) . v a l u e   =   a r t i c l e . t i t l e ; 
 
                                 d o c u m e n t . g e t E l e m e n t B y I d ( ' b l o g - d a t e ' ) . v a l u e   =   a r t i c l e . p u b l i s h e d _ a t . s p l i t ( ' T ' ) [ 0 ] ; 
 
                                 d o c u m e n t . g e t E l e m e n t B y I d ( ' b l o g - i m a g e ' ) . v a l u e   =   a r t i c l e . i m a g e _ u r l ; 
 
                                 d o c u m e n t . g e t E l e m e n t B y I d ( ' b l o g - d e s c ' ) . v a l u e   =   a r t i c l e . p r e v i e w _ t e x t ; 
 
                                 d o c u m e n t . g e t E l e m e n t B y I d ( ' b l o g - l i n k ' ) . v a l u e   =   a r t i c l e . e x t e r n a l _ u r l ; 
 
                         } 
 
                 } 
 
         } , 
 
 
 
         c l o s e E d i t o r :   f u n c t i o n   ( )   { 
 
                 d o c u m e n t . g e t E l e m e n t B y I d ( ' b l o g - e d i t o r - v i e w ' ) . c l a s s L i s t . a d d ( ' h i d d e n ' ) ; 
 
                 d o c u m e n t . g e t E l e m e n t B y I d ( ' b l o g - l i s t - v i e w ' ) . c l a s s L i s t . r e m o v e ( ' h i d d e n ' ) ; 
 
         } , 
 
 
 
         e d i t :   f u n c t i o n   ( i d )   { 
 
                 t h i s . o p e n E d i t o r ( i d ) ; 
 
         } , 
 
 
 
         s a v e A r t i c l e :   a s y n c   f u n c t i o n   ( )   { 
 
                 c o n s t   i d   =   d o c u m e n t . g e t E l e m e n t B y I d ( ' b l o g - i d ' ) . v a l u e ; 
 
                 c o n s t   t i t l e   =   d o c u m e n t . g e t E l e m e n t B y I d ( ' b l o g - t i t l e ' ) . v a l u e ; 
 
                 c o n s t   d a t e   =   d o c u m e n t . g e t E l e m e n t B y I d ( ' b l o g - d a t e ' ) . v a l u e ; 
 
                 c o n s t   i m g   =   d o c u m e n t . g e t E l e m e n t B y I d ( ' b l o g - i m a g e ' ) . v a l u e ; 
 
                 c o n s t   d e s c   =   d o c u m e n t . g e t E l e m e n t B y I d ( ' b l o g - d e s c ' ) . v a l u e ; 
 
                 c o n s t   l i n k   =   d o c u m e n t . g e t E l e m e n t B y I d ( ' b l o g - l i n k ' ) . v a l u e ; 
 
 
 
                 i f   ( ! t i t l e )   { 
 
                         a l e r t ( ' V y p l 9 t e   p r o s ­ m   a l e s p o 9   t i t u l e k . ' ) ; 
 
                         r e t u r n ; 
 
                 } 
 
 
 
                 c o n s t   p a y l o a d   =   { 
 
                         t i t l e :   t i t l e , 
 
                         p u b l i s h e d _ a t :   d a t e , 
 
                         i m a g e _ u r l :   i m g , 
 
                         p r e v i e w _ t e x t :   d e s c , 
 
                         e x t e r n a l _ u r l :   l i n k , 
 
                         / /   a u t h o r _ i d :   1   / /   O p t i o n a l :   i f   y o u   h a v e   b r o k e r   I D 
 
                 } ; 
 
 
 
                 l e t   e r r   =   n u l l ; 
 
 
 
                 i f   ( i d )   { 
 
                         / /   U P D A T E 
 
                         c o n s t   {   e r r o r   }   =   a w a i t   w i n d o w . s u p a b a s e C l i e n t 
 
                                 . f r o m ( ' a r t i c l e s ' ) 
 
                                 . u p d a t e ( p a y l o a d ) 
 
                                 . e q ( ' i d ' ,   i d ) ; 
 
                         e r r   =   e r r o r ; 
 
                 }   e l s e   { 
 
                         / /   I N S E R T 
 
                         c o n s t   {   e r r o r   }   =   a w a i t   w i n d o w . s u p a b a s e C l i e n t 
 
                                 . f r o m ( ' a r t i c l e s ' ) 
 
                                 . i n s e r t ( [ p a y l o a d ] ) ; 
 
                         e r r   =   e r r o r ; 
 
                 } 
 
 
 
                 i f   ( e r r )   { 
 
                         c o n s o l e . e r r o r ( " S a v e   A r t i c l e   E r r o r : " ,   e r r ) ; 
 
                         a l e r t ( " C h y b a   p 9"!i   u k l Çd Çn ­ :   "   +   e r r . m e s s a g e ) ; 
 
                 }   e l s e   { 
 
                         i f   ( w i n d o w . s h o w T o a s t )   w i n d o w . s h o w T o a s t ( ' Ä Zl Çn e k   u l o 9>e n ' ) ; 
 
                         t h i s . c l o s e E d i t o r ( ) ; 
 
                         t h i s . f e t c h F o r A d m i n ( ) ; 
 
                 } 
 
         } , 
 
 
 
         d e l e t e :   a s y n c   f u n c t i o n   ( i d )   { 
 
                 i f   ( ! c o n f i r m ( ' O p r a v d u   c h c e t e   t e n t o   Ä dl Çn e k   s m a z a t ? ' ) )   r e t u r n ; 
 
 
 
                 c o n s t   {   e r r o r   }   =   a w a i t   w i n d o w . s u p a b a s e C l i e n t 
 
                         . f r o m ( ' a r t i c l e s ' ) 
 
                         . d e l e t e ( ) 
 
                         . e q ( ' i d ' ,   i d ) ; 
 
 
 
                 i f   ( e r r o r )   { 
 
                         a l e r t ( " C h y b a   p 9"!i   m a z Çn ­ . " ) ; 
 
                 }   e l s e   { 
 
                         i f   ( w i n d o w . s h o w T o a s t )   w i n d o w . s h o w T o a s t ( ' Ä Zl Çn e k   s m a z Çn ' ) ; 
 
                         t h i s . f e t c h F o r A d m i n ( ) ; 
 
                 } 
 
         } 
 
 } ; 
 
 
 
 / /   A u t o - i n i t   p u b l i c   g r i d   i f   o n   p a g e 
 
 d o c u m e n t . a d d E v e n t L i s t e n e r ( ' D O M C o n t e n t L o a d e d ' ,   ( )   = >   { 
 
         / /   S m a l l   d e l a y   t o   e n s u r e   S u p a b a s e   c l i e n t   i s   r e a d y 
 
         s e t T i m e o u t ( ( )   = >   { 
 
                 i f   ( w i n d o w . B l o g M a n a g e r )   w i n d o w . B l o g M a n a g e r . i n i t P u b l i c ( ) ; 
 
         } ,   1 0 0 0 ) ; 
 
 } ) ; 
 
 
