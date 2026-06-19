import { createClient } from '@supabase/supabase-js';

// Hardcode your strings directly here for the mobile bundle
const SUPABASE_URL = 'https://rxsionpqvqdkttmgzsqw.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_F_K5A2_cFLC-UkkL05DNhg_eOxaXFlf';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);