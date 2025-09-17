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

-- Create policy for admin access (only service role can access)
CREATE POLICY "Service role only access" 
ON public.admin_credentials 
FOR ALL 
USING (false);

-- Insert default admin credentials (plain text for now, will use bcrypt in edge function)
INSERT INTO public.admin_credentials (email, password_hash, full_name) 
VALUES ('tathastuagarwala26@gmail.com', 'Hotmeha21@21@', 'SAGNIK SAHA');

-- Enable realtime for panic_alerts and user_locations (skip if already exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'panic_alerts'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.panic_alerts;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'user_locations'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.user_locations;
    END IF;
END $$;

-- Create trigger for automatic timestamp updates on admin_credentials
CREATE TRIGGER update_admin_credentials_updated_at
BEFORE UPDATE ON public.admin_credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();