-- Add foreign key relationships for better querying
ALTER TABLE public.user_locations 
ADD CONSTRAINT fk_user_locations_profiles 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.panic_alerts 
ADD CONSTRAINT fk_panic_alerts_profiles 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;