import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { load } from 'https://esm.sh/cheerio@1.0.0-rc.12'

// --- CONFIGURATION ---
const TARGET_URL = Deno.env.get('TARGET_URL') ?? 'https://www.remax-czech.cz/reality/nemovitosti-maklere/9118/filip-vorlicek/'
const EMERGENCY_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mamJod2h4endxbG1ocmltZGFrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODc3NzMyNSwiZXhwIjoyMDg0MzUzMzI1fQ.r8IgOdMNQqZULK5VrBtCoV4sDAbiEYRmFyV7RZDPt0w";
const FALLBACK_BROKER_ID = "00000000-0000-0000-0000-000000000000";

const FETCH_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'cs,en-US;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
}

let activeKey = EMERGENCY_KEY;
const envCustom = Deno.env.get('CUSTOM_SYNC_TOKEN');
if (envCustom && envCustom.length > 50) activeKey = envCustom;

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? 'https://nfjbhwhxzwqlmhrimdak.supabase.co'
const supabase = createClient(supabaseUrl, activeKey)

/**
 * STRATEGIES
 */
interface ScraperStrategy {
    name: string;
    parse: ($: any, el: any) => any;
    findItems: ($: any) => any;
}

const STRATEGIES: Record<string, ScraperStrategy> = {
    remax: {
        name: 'remax',
        findItems: ($) => {
            // Aggressive RE/MAX finding
            return $('.re-list__item, article, .listing-item, .property-item, .item, .col-md-6, .pl-items__item')
                .has('a[href*="/reality/detail/"]');
        },
        parse: ($, el) => {
            const $el = $(el);
            let title = $el.find('h2, .re-list__title, .property-title').first().text().trim();
            const linkEl = $el.find('a[href*="/reality/detail/"]').first();
            const linkHref = linkEl.attr('href');

            if (!title && linkEl.length > 0) title = linkEl.text().trim();

            const imgEl = $el.find('img').first();
            const imgUrl = imgEl.attr('data-src') || imgEl.attr('src');

            const priceText = $el.find('.re-list__price, .price, .property-price').text();
            const price = parseInt(priceText.replace(/\D/g, ''), 10) || 0;

            const description = $el.find('.re-list__desc, .description').text().trim();
            const location = $el.find('.re-list__address, .address').text().trim();

            return { title, linkHref, imgUrl, price, description, location };
        }
    },
    // Add other portals here
    universal: {
        name: 'universal',
        findItems: ($) => $('.listing, .property, .item, article').has('a'),
        parse: ($, el) => {
            const $el = $(el);
            const linkEl = $el.find('a').first();
            const title = linkEl.text().trim() || $el.text().substring(0, 50).trim();
            const linkHref = linkEl.attr('href');
            const imgUrl = $el.find('img').attr('src');
            return { title, linkHref, imgUrl, price: 0, description: '', location: '' };
        }
    }
};

/**
 * Main Handler
 */
Deno.serve(async (req: Request) => {
    // 0. SECURITY
    const authHeader = req.headers.get('Authorization') || ''
    let receivedToken = authHeader.replace(/^Bearer\s+/i, '').trim().replace(/^<|>$/g, '');

    if (receivedToken !== activeKey) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    const syncLogId = crypto.randomUUID()
    const startTime = new Date()
    let processedCount = 0
    let upsertedCount = 0
    let finalStatus = 'success'
    let errorMessage = null
    let brokerId = null;
    // ^ Note: User requested "return the id (which is 12)".
    // Assuming this means use the exact FK value found in site_content.

    try {
        console.log(`[Sync ${syncLogId}] Starting... Target: ${TARGET_URL}`)
        await logSyncStart(syncLogId, startTime)

        // 1. Resolve Broker (User Req: section='broker_profile', match value)
        const brokerInfo = await resolveBrokerInfo(TARGET_URL)

        let source = 'universal';
        if (brokerInfo) {
            brokerId = brokerInfo.broker_id; // UUID matching listings.broker_id
            console.log(`[Sync] Identified Broker ID: ${brokerId} (from table ID: ${brokerInfo.id})`);

            // Heuristic for source
            if (TARGET_URL.includes('remax')) source = 'remax';
            else if (brokerInfo.value && (brokerInfo.value as any).source) source = (brokerInfo.value as any).source;
        } else {
            console.warn(`[Sync] Could not resolve Broker via DB. Using Fallback.`);
            brokerId = FALLBACK_BROKER_ID;
            if (TARGET_URL.includes('remax')) source = 'remax';
        }

        // 2. Strategy
        const strategy = STRATEGIES[source] || STRATEGIES['universal'];
        console.log(`[Sync] Using Strategy: ${strategy.name}`);

        // 3. Scrape
        const scrapedListings = await scrapeToCheerio(TARGET_URL, brokerId, strategy)
        processedCount = scrapedListings.length
        console.log(`[Sync ${syncLogId}] Scraped ${processedCount} listings.`)

        // 4. Sync
        if (processedCount > 0) {
            upsertedCount = await syncToDatabase(scrapedListings)
        } else {
            console.log("[Sync] No listings found.")
        }

        // 5. Cleanup
        if (brokerId && brokerId !== FALLBACK_BROKER_ID) {
            await markInactiveListings(scrapedListings, brokerId)
        }

    } catch (err) {
        console.error(`[Sync ${syncLogId}] Error:`, err)
        finalStatus = 'error'
        errorMessage = err instanceof Error ? err.message : String(err)
    } finally {
        await logSyncEnd(syncLogId, finalStatus, processedCount, upsertedCount, errorMessage)
    }

    return new Response(
        JSON.stringify({
            message: 'Sync completed',
            stats: { processed: processedCount, upserted: upsertedCount, brokerId }
        }),
        { headers: { 'Content-Type': 'application/json' } }
    )
})

// --- HELPERS ---

async function resolveBrokerInfo(url: string) {
    // User Update: Find record where section = 'broker_profile' and URL matches
    // Using simple text match on JSONB value if stored as string, or logic for object
    // Assuming 'value' is the URL string itself or contains it.
    // The previous code used .contains which works on JSONB.

    // First try exact match on value if it's a simple string-like JSON
    // Or just look for section 'broker_profile' and check matches manually strictly?
    // Let's stick to the .contains logic as it's flexible for JSONB { "text": "url" } or just "url"

    // Actually, user said: "Look for the URL inside the JSONB 'value' column"
    // And "section = 'broker_profile'"

    const { data, error } = await supabase
        .from('site_content')
        .select('id, broker_id, value')
        .eq('section', 'broker_profile')
        // We use text filtering which works if column is casted or we fetch & filter
        // If 'value' is JSONB, we can't easily ILIKE. 
        // Let's rely on the previous successful logic or fetch all broker_profiles and find matches in JS (safest for small count)
        .select()

    if (error || !data) {
        console.error("Broker Info Error:", error);
        return null;
    }

    // JS Filter for exact URL match inside the generic structure
    const match = data.find((row: any) => {
        const val = row.value;
        if (typeof val === 'string') return val.includes(url);
        if (typeof val === 'object' && val) {
            // Check common fields
            if (val.url === url) return true;
            if (val.link === url) return true;
            if (val.href === url) return true;
            // Deep text search
            return JSON.stringify(val).includes(url);
        }
        return false;
    });

    return match || null;
}

async function scrapeToCheerio(url: string, brokerId: string, strategy: ScraperStrategy) {
    const listings: any[] = []
    let nextPageUrl: string | null = url
    let pageCount = 0
    const MAX_PAGES = 5

    while (nextPageUrl && pageCount < MAX_PAGES) {
        console.log(`Fetching ${nextPageUrl}...`)
        const res = await fetch(nextPageUrl, { headers: FETCH_HEADERS })
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`)

        const html = await res.text()
        const $ = load(html)

        // DEBUG
        console.log(`[HTML Debug] <a> count: ${$('a').length}`);

        // Find items using strategy
        const items = strategy.findItems($);
        console.log(`Found ${items.length} items using strategy: ${strategy.name}`)

        const baseUrl = new URL(url).origin;

        items.each((_: number, el: any) => {
            try {
                const parsed = strategy.parse($, el);

                if (!parsed.linkHref) return;

                const absoluteLink = new URL(parsed.linkHref, baseUrl).href;

                // Ensure price is int
                const finalPrice = typeof parsed.price === 'number' && !isNaN(parsed.price) ? parsed.price : 0;

                // Images: Ensure Array
                const imageArray = parsed.imgUrl ? [parsed.imgUrl] : [];

                if (parsed.title) {
                    listings.push({
                        title: parsed.title,
                        price: finalPrice,
                        description: (parsed.description || '').substring(0, 500),
                        images: imageArray, // Matches text[] column
                        external_url: absoluteLink,
                        external_source: strategy.name,
                        status: 'active',
                        location: parsed.location || '',
                        // Use validated brokerId
                        ...(brokerId && brokerId !== FALLBACK_BROKER_ID ? { broker_id: brokerId } : {})
                    })
                }
            } catch (e) {
                console.error("Error parsing item:", e)
            }
        })

        const nextLink = $('.pagination .next, .paging .next, a[rel="next"], .next').first().attr('href')
        nextPageUrl = nextLink ? new URL(nextLink, baseUrl).href : null
        pageCount++
    }
    return listings
}

async function syncToDatabase(listings: any[]) {
    const { data, error } = await supabase
        .from('listings')
        .upsert(listings, { onConflict: 'external_url', ignoreDuplicates: false })
        .select()
    if (error) throw new Error(error.message)
    if (data && data.length > 0) {
        const ids = data.map((d: any) => d.id)
        await supabase.from('listings').update({ last_synced_at: new Date() }).in('id', ids)
    }
    return data?.length || 0
}

async function markInactiveListings(activeListings: any[], brokerId: string) {
    const activeUrls = new Set(activeListings.map((l: any) => l.external_url))
    const { data: dbRows } = await supabase
        .from('listings')
        .select('external_url')
        .eq('broker_id', brokerId)
        .eq('status', 'active')

    if (!dbRows) return
    const missing = dbRows.filter((row: any) => !activeUrls.has(row.external_url))
    const missingUrls = missing.map((r: any) => r.external_url)

    if (missingUrls.length > 0) {
        await supabase.from('listings').update({ status: 'inactive', last_synced_at: new Date() }).in('external_url', missingUrls)
    }
}

async function logSyncStart(id: string, start: Date) {
    await supabase.from('sync_logs').insert({ id, started_at: start, status: 'running' })
}
async function logSyncEnd(id: string, status: string, processed: number, upserted: number, msg: string | null) {
    await supabase.from('sync_logs').update({
        ended_at: new Date(),
        status,
        items_processed: processed,
        items_upserted: upserted,
        error_message: msg
    }).eq('id', id)
}
