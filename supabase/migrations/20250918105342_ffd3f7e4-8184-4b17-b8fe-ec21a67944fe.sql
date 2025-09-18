-- Add KYC and profile completion fields to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nationality TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS passport_number TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS aadhaar_number TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS document_url TEXT;

-- Update the trigger to handle profile creation on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$;