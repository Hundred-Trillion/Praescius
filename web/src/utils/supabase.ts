import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://yoyljhlapbkudqwuusvy.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_Y8QeLkF1fwoWh0-373BGmQ_UoLCLNPQ'; // Using provided key

export const supabase = createClient(supabaseUrl, supabaseKey);
