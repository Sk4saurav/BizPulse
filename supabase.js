const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || 'dummy_key';

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
