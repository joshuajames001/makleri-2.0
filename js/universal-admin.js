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
            pencil.innerText = '✎';
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
