-- Create proper relationships and ensure data integrity

-- Update admin login function to use simple password comparison for demo
UPDATE public.admin_credentials 
SET password_hash = 'Hotmeha21@21@' 
WHERE email = 'tathastuagarwala26@gmail.com';

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_locations_user_id ON public.user_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_locations_created_at ON public.user_locations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_panic_alerts_user_id ON public.panic_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_panic_alerts_status ON public.panic_alerts(status);
CREATE INDEX IF NOT EXISTS idx_panic_alerts_created_at ON public.panic_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_destinations_user_id ON public.destinations(user_id);

-- Enable Row Level Security on all tables
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.panic_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.destinations ENABLE ROW LEVEL SECURITY;

-- Create comprehensive RLS policies

-- User Locations Policies
DROP POLICY IF EXISTS "Users can view their own locations" ON public.user_locations;
DROP POLICY IF EXISTS "Users can create their own locations" ON public.user_locations;
DROP POLICY IF EXISTS "Users can update their own locations" ON public.user_locations;
DROP POLICY IF EXISTS "Users can delete their own locations" ON public.user_locations;

CREATE POLICY "Users can view their own locations" ON public.user_locations
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own locations" ON public.user_locations
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own locations" ON public.user_locations
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own locations" ON public.user_locations
FOR DELETE USING (auth.uid() = user_id);

-- Panic Alerts Policies
DROP POLICY IF EXISTS "Users can view their own panic alerts" ON public.panic_alerts;
DROP POLICY IF EXISTS "Users can create their own panic alerts" ON public.panic_alerts;
DROP POLICY IF EXISTS "Users can update their own panic alerts" ON public.panic_alerts;
DROP POLICY IF EXISTS "Users can delete their own panic alerts" ON public.panic_alerts;

CREATE POLICY "Users can view their own panic alerts" ON public.panic_alerts
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own panic alerts" ON public.panic_alerts
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own panic alerts" ON public.panic_alerts
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own panic alerts" ON public.panic_alerts
FOR DELETE USING (auth.uid() = user_id);

-- Destinations Policies
DROP POLICY IF EXISTS "Users can view their own destinations" ON public.destinations;
DROP POLICY IF EXISTS "Users can create their own destinations" ON public.destinations;  
DROP POLICY IF EXISTS "Users can update their own destinations" ON public.destinations;
DROP POLICY IF EXISTS "Users can delete their own destinations" ON public.destinations;

CREATE POLICY "Users can view their own destinations" ON public.destinations
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own destinations" ON public.destinations
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own destinations" ON public.destinations
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own destinations" ON public.destinations
FOR DELETE USING (auth.uid() = user_id);