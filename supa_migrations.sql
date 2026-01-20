-- Create sync_logs table to track execution history
CREATE TABLE IF NOT EXISTS public.sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    status TEXT NOT NULL CHECK (status IN ('running', 'success', 'error', 'partial_error')),
    items_processed INTEGER DEFAULT 0,
    items_upserted INTEGER DEFAULT 0,
    items_archived INTEGER DEFAULT 0,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS on sync_logs (viewable by auth users, writable by service role)
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for authenticated users" ON public.sync_logs
    FOR SELECT TO authenticated USING (true);
    
-- Ensure listings table has necessary columns for sync
-- We assume title, price, description, images, location already exist per user context.
-- We add columns to track external source and sync status.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'listings' AND column_name = 'external_url') THEN
        ALTER TABLE public.listings ADD COLUMN external_url TEXT;
        ALTER TABLE public.listings ADD CONSTRAINT listings_external_url_key UNIQUE (external_url);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'listings' AND column_name = 'status') THEN
        ALTER TABLE public.listings ADD COLUMN status TEXT DEFAULT 'active';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'listings' AND column_name = 'last_synced_at') THEN
        ALTER TABLE public.listings ADD COLUMN last_synced_at TIMESTAMPTZ;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'listings' AND column_name = 'external_source') THEN
        ALTER TABLE public.listings ADD COLUMN external_source TEXT; -- e.g., 'sreality', 'remax'
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'listings' AND column_name = 'broker_id') THEN
        ALTER TABLE public.listings ADD COLUMN broker_id UUID; 
        -- Optional: ADD CONSTRAINT fk_broker FOREIGN KEY (broker_id) REFERENCES public.users(id);
    END IF;
END $$;
