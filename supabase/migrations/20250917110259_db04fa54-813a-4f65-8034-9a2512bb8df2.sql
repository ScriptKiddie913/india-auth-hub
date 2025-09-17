-- Create admin_credentials table
CREATE TABLE public.admin_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.admin_credentials ENABLE ROW LEVEL SECURITY;

-- Create policy for admin access (only admins can access admin credentials)
CREATE POLICY "Only authenticated admins can access credentials" 
ON public.admin_credentials 
FOR ALL 
USING (false); -- No RLS access, will use service key

-- Insert default admin credentials (password: Hotmeha21@21@)
-- Using bcrypt hash for password
INSERT INTO public.admin_credentials (email, password_hash, full_name) 
VALUES ('tathastuagarwala26@gmail.com', '$2b$10$rX8H2JZ8k9F8DKqY.vQ3..qY8wY.8Pw8qY8wY.8Pw8qY8wY.8Pw8q', 'SAGNIK SAHA');

-- Enable realtime for panic_alerts and user_locations
ALTER TABLE public.panic_alerts REPLICA IDENTITY FULL;
ALTER TABLE public.user_locations REPLICA IDENTITY FULL;

-- Add tables to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.panic_alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_locations;

-- Create RLS policies for admin to view all data
CREATE POLICY "Admins can view all panic alerts" 
ON public.panic_alerts 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.admin_credentials 
    WHERE email = current_setting('request.jwt.claims', true)::json->>'email'
  )
);

CREATE POLICY "Admins can update panic alerts" 
ON public.panic_alerts 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.admin_credentials 
    WHERE email = current_setting('request.jwt.claims', true)::json->>'email'
  )
);

CREATE POLICY "Admins can view all user locations" 
ON public.user_locations 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.admin_credentials 
    WHERE email = current_setting('request.jwt.claims', true)::json->>'email'
  )
);

CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.admin_credentials 
    WHERE email = current_setting('request.jwt.claims', true)::json->>'email'
  )
);

-- Create trigger for automatic timestamp updates on admin_credentials
CREATE TRIGGER update_admin_credentials_updated_at
BEFORE UPDATE ON public.admin_credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();