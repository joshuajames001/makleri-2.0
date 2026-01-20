
const { createClient } = require('https://esm.sh/@supabase/supabase-js@2');

const url = 'https://nfjbhwhxzwqlmhrimdak.supabase.co';
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mamJod2h4endxbG1ocmltZGFrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODc3NzMyNSwiZXhwIjoyMDg0MzUzMzI1fQ.r8IgOdMNQqZULK5VrBtCoV4sDAbiEYRmFyV7RZDPt0w";
const supabase = createClient(url, key);

async function run() {
    const { data, error } = await supabase
        .from('site_content')
        .select('broker_id, value')
        .ilike('value', '%filip-vorlicek%')
        .limit(1);

    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Result:", JSON.stringify(data, null, 2));
    }
}

run();
