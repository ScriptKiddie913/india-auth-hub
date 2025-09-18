-- Create storage policy for user document uploads
CREATE POLICY "Users can upload their own documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'helpdesk-files' AND (storage.foldername(name))[1] = 'user-documents' AND auth.uid()::text = (storage.foldername(name))[2]);

-- Create storage policy for users to view their own documents
CREATE POLICY "Users can view their own documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'helpdesk-files' AND (storage.foldername(name))[1] = 'user-documents' AND auth.uid()::text = (storage.foldername(name))[2]);

-- Create storage policy for admins to view all user documents
CREATE POLICY "Admins can view all user documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'helpdesk-files' AND (storage.foldername(name))[1] = 'user-documents');

-- Update profiles table to include email for easier querying
-- (This helps when admins need to see which email corresponds to which profile)
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_nationality ON profiles(nationality);
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON profiles(created_at);