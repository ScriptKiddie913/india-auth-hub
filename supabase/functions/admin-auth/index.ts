import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  console.log('Admin auth function called:', req.method, req.url);
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log('Reading request body...');
    const body = await req.text();
    console.log('Request body:', body);
    
    const { email, password } = JSON.parse(body);
    console.log('Parsed credentials:', { email, password: '***' });

    // Query admin credentials using service role key
    console.log('Querying admin credentials...');
    const { data: adminData, error } = await supabaseClient
      .from('admin_credentials')
      .select('*')
      .eq('email', email)
      .single()

    console.log('Query result:', { adminData: adminData ? 'found' : 'not found', error });

    if (error || !adminData) {
      console.log('Invalid credentials - user not found');
      return new Response(
        JSON.stringify({ error: 'Invalid credentials' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401 
        }
      )
    }

    // Simple password check
    console.log('Checking password...');
    if (adminData.password_hash !== password) {
      console.log('Invalid credentials - wrong password');
      return new Response(
        JSON.stringify({ error: 'Invalid credentials' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401 
        }
      )
    }

    console.log('Login successful');
    // Return success with admin data
    return new Response(
      JSON.stringify({ 
        success: true,
        admin: {
          id: adminData.id,
          email: adminData.email,
          full_name: adminData.full_name
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error in admin auth:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})