-- Create helpdesk storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('helpdesk-files', 'helpdesk-files', true);

-- Create chat_threads table
CREATE TABLE public.chat_threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create chat_messages table
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text',
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Create policies for chat_threads
CREATE POLICY "Users can view their own threads" 
ON public.chat_threads 
FOR SELECT 
USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can create their own threads" 
ON public.chat_threads 
FOR INSERT 
WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can update their own threads" 
ON public.chat_threads 
FOR UPDATE 
USING (auth.uid()::text = user_id::text);

CREATE POLICY "Admins can view all threads" 
ON public.chat_threads 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can update all threads" 
ON public.chat_threads 
FOR UPDATE 
USING (true);

-- Create policies for chat_messages
CREATE POLICY "Users can view messages in their threads" 
ON public.chat_messages 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.chat_threads 
  WHERE id = thread_id AND user_id::text = auth.uid()::text
));

CREATE POLICY "Users can create messages in their threads" 
ON public.chat_messages 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM public.chat_threads 
  WHERE id = thread_id AND user_id::text = auth.uid()::text
));

CREATE POLICY "Admins can view all messages" 
ON public.chat_messages 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can create messages in any thread" 
ON public.chat_messages 
FOR INSERT 
WITH CHECK (true);

-- Create storage policies for helpdesk files
CREATE POLICY "Anyone can view helpdesk files" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'helpdesk-files');

CREATE POLICY "Authenticated users can upload helpdesk files" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'helpdesk-files' AND auth.role() = 'authenticated');

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_chat_thread_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.chat_threads 
  SET updated_at = now() 
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update thread timestamp when message is added
CREATE TRIGGER update_thread_timestamp
AFTER INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_chat_thread_timestamp();

-- Create trigger for automatic timestamp updates on chat_threads
CREATE TRIGGER update_chat_threads_updated_at
BEFORE UPDATE ON public.chat_threads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();