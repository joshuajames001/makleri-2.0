/**
 * ANELA Digital - Onboarding Data Receiver
 * 
 * Purpose: Takes JSON output from the Onboarding Agent and syncs it 
 * directly to the 'site_content' table in Supabase.
 * 
 * Usage: 
 *   window.OnboardingReceiver.import(jsonData)
 * 
 * Expected JSON Format:
 * [
 *   { "section": "hero", "key": "title", "value": "Nejlepší makléř v Praze" },
 *   { "section": "about", "key": "bio", "value": "<p>Jsem zkušený...</p>" },
 *   ...
 * ]
 * 
 * Or nested format (optional support):
 * {
 *   "hero": { "title": "...", "subtitle": "..." },
 *   "about": { ... }
 * }
 */

window.OnboardingReceiver = {

    /**
     * Main Entry Point
     * @param {Array|Object} data - The JSON from Onboarding Agent
     */
    import: async function (data) {
        console.log("Onboarding Receiver: Starting import...", data);

        if (!window.supabaseClient) {
            console.error("Onboarding Receiver: Supabase client not found!");
            alert("Chyba: Supabase není inicializována.");
            return;
        }

        // 1. Normalize Data to Array format for DB
        const rowsToUpsert = this.normalizeData(data);

        if (rowsToUpsert.length === 0) {
            console.warn("Onboarding Receiver: No valid data found to import.");
            alert("Upozornění: Žádná data k importu.");
            return;
        }

        console.log(`Onboarding Receiver: Prepared ${rowsToUpsert.length} items for sync.`);

        // 2. Batch Upsert to Supabase
        try {
            // We use 'site_content' table
            // Upsert based on composite unique constraint if exists, otherwise assume unique index on section+key
            // Supabase upsert usually requires specifying the conflict column(s) if not primary key

            // NOTE: We do multiple requests or one big batch. 
            // 'site_content' schema usually has (section, key) as unique or PK.

            const { data: result, error } = await window.supabaseClient
                .from('site_content')
                .upsert(rowsToUpsert, { onConflict: 'section,key' }); // Assuming composite constraint

            if (error) throw error;

            console.log("Onboarding Receiver: Success!", result);

            // 3. Feedback & Refresh
            if (window.showToast) {
                window.showToast(`Úspěšně importováno ${rowsToUpsert.length} položek!`);
            } else {
                alert(`Import dokončen! (${rowsToUpsert.length} položek)`);
            }

            // Reload page to see changes? or just re-fetch
            if (confirm("Import dokončen. Chcete obnovit stránku pro zobrazení změn?")) {
                window.location.reload();
            }

        } catch (e) {
            console.error("Onboarding Receiver Error:", e);
            alert("Chyba při importu dat: " + e.message);
        }
    },

    /**
     * Helper: Converts various JSON shapes into DB row format
     */
    normalizeData: function (input) {
        const rows = [];
        const timestamp = new Date().toISOString();

        // Shape A: Array of {section, key, value}
        if (Array.isArray(input)) {
            input.forEach(item => {
                if (item.section && item.key) {
                    rows.push({
                        section: item.section,
                        key: item.key,
                        value: item.value, // 'value' column in DB usually
                        updated_at: timestamp,
                        is_active: true
                    });
                }
            });
        }
        // Shape B: Object { section: { key: value } }
        else if (typeof input === 'object' && input !== null) {
            Object.keys(input).forEach(section => {
                const sectionData = input[section];
                if (typeof sectionData === 'object' && sectionData !== null) {
                    Object.keys(sectionData).forEach(key => {
                        rows.push({
                            section: section,
                            key: key,
                            value: sectionData[key],
                            updated_at: timestamp,
                            is_active: true
                        });
                    });
                }
            });
        }

        return rows;
    }
};
