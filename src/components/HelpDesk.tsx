import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Send, Paperclip, Phone, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { User as SupabaseUser } from "@supabase/supabase-js";

interface ChatThread {
  id: string;
  user_id: string;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface ChatMessage {
  id: string;
  thread_id: string;
  sender_id: string;
  content_type: string;
  content: string;
  created_at: string;
}

function ChatWindow({ thread, currentUser }: { thread: ChatThread, currentUser: SupabaseUser }) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();

    const loadMessages = useCallback(async () => {
        if (!thread) return;
        try {
            const { data, error } = await supabase
                .from('chat_messages')
                .select('*')
                .eq('thread_id', thread.id)
                .order('created_at', { ascending: true });
            
            if (error) throw error;
            setMessages(data as ChatMessage[] || []);
        } catch (error: any) {
            toast({
                title: "Error loading messages",
                description: error.message,
                variant: "destructive"
            });
        }
    }, [thread, toast]);

    useEffect(() => {
        loadMessages();
        const interval = setInterval(loadMessages, 5000); // Poll for new messages
        return () => clearInterval(interval);
    }, [loadMessages]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSendMessage = async (contentType = 'text', content = newMessage) => {
        if (!content.trim()) return;
        setIsLoading(true);
        try {
            const { error } = await supabase
                .from('chat_messages')
                .insert({
                    thread_id: thread.id,
                    sender_id: currentUser.id,
                    content_type: contentType,
                    content: content
                } as any);
            
            if (error) throw error;
            setNewMessage('');
            await loadMessages();
        } catch (error: any) {
            toast({
                title: "Error sending message",
                description: error.message,
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if(!file) return;
        setIsLoading(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const { data, error } = await supabase.storage
                .from('helpdesk-files')
                .upload(fileName, file);
            
            if (error) throw error;
            
            const { data: { publicUrl } } = supabase.storage
                .from('helpdesk-files')
                .getPublicUrl(fileName);
            
            await handleSendMessage('image', publicUrl);
        } catch(error: any) {
            toast({
                title: "File upload failed",
                description: error.message,
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
            if (e.target) e.target.value = '';
        }
    }

    return (
        <div className="flex flex-col h-[60vh]">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.sender_id === currentUser.id ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-xs lg:max-w-md p-3 rounded-lg ${msg.sender_id === currentUser.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>
                            {msg.content_type === 'text' && <p>{msg.content}</p>}
                            {msg.content_type === 'image' && (
                                <a href={msg.content} target="_blank" rel="noopener noreferrer">
                                    <img src={msg.content} className="max-w-full rounded-md" alt="Uploaded file" />
                                </a>
                            )}
                            {msg.content_type === 'call_request' && (
                                <p className="flex items-center gap-2">
                                    <Phone className="w-4 h-4"/> Call requested by user.
                                </p>
                            )}
                            {msg.content_type === 'system' && (
                                <p className="text-xs italic text-center">{msg.content}</p>
                            )}
                            <p className="text-xs mt-1 opacity-75">{format(new Date(msg.created_at), 'p')}</p>
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
            <div className="border-t p-4 flex gap-2 items-center">
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*"/>
                <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={isLoading}>
                    <Paperclip className="w-4 h-4"/>
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleSendMessage('call_request', 'User requests a call.')} disabled={isLoading}>
                    <Phone className="w-4 h-4"/>
                </Button>
                <Input 
                    value={newMessage} 
                    onChange={e => setNewMessage(e.target.value)} 
                    placeholder="Type your message..." 
                    disabled={isLoading} 
                    onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                />
                <Button onClick={() => handleSendMessage()} disabled={isLoading}>
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4"/>}
                </Button>
            </div>
        </div>
    );
}

export default function HelpDesk() {
    const [user, setUser] = useState<SupabaseUser | null>(null);
    const [threads, setThreads] = useState<ChatThread[]>([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [newSubject, setNewSubject] = useState('');
    const [activeThread, setActiveThread] = useState<ChatThread | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        initializeHelpDesk();
    }, []);

    const initializeHelpDesk = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            
            setUser(user);
            const { data, error } = await supabase
                .from('chat_threads')
                .select('*')
                .eq('user_id', user.id)
                .order('updated_at', { ascending: false });
            
            if (error) throw error;
            setThreads(data as ChatThread[] || []);
        } catch (error: any) {
            toast({
                title: "Error loading helpdesk",
                description: error.message,
                variant: "destructive"
            });
        }
    };
    
    const handleCreateThread = async () => {
        if (!newSubject.trim() || !user) return;
        try {
            const { data, error } = await supabase
                .from('chat_threads')
                .insert({
                    user_id: user.id,
                    subject: newSubject,
                    status: 'open'
                } as any)
                .select()
                .single();
            
            if (error) throw error;
            
            // Add system message
            await supabase
                .from('chat_messages')
                .insert({
                    thread_id: data.id,
                    sender_id: 'system',
                    content_type: 'system',
                    content: 'Thread created. An admin will be with you shortly.'
                } as any);
            
            setNewSubject('');
            setIsDialogOpen(false);
            await initializeHelpDesk();
            setActiveThread(data);
            
            toast({
                title: "Support ticket created",
                description: "Your ticket has been created successfully."
            });
        } catch (error: any) {
            toast({
                title: "Error creating ticket",
                description: error.message,
                variant: "destructive"
            });
        }
    }

    if (!user) return <div>Loading...</div>;

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="md:col-span-1">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Support Tickets</CardTitle>
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm">
                                <Plus className="w-4 h-4 mr-1"/> New
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Create New Support Ticket</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                                <div>
                                    <Label>Subject</Label>
                                    <Input 
                                        value={newSubject} 
                                        onChange={e => setNewSubject(e.target.value)} 
                                        placeholder="e.g., Problem with my booking"
                                    />
                                </div>
                                <Button onClick={handleCreateThread}>Create Ticket</Button>
                            </div>
                        </DialogContent>
                    </Dialog>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        {threads.map(thread => (
                            <div 
                                key={thread.id} 
                                onClick={() => setActiveThread(thread)} 
                                className={`p-3 border rounded-md cursor-pointer transition-colors ${
                                    activeThread?.id === thread.id ? 'bg-primary/10 border-primary' : 'hover:bg-secondary'
                                }`}
                            >
                                <p className="font-semibold">{thread.subject}</p>
                                <div className="flex justify-between items-center text-xs mt-1">
                                    <Badge variant={thread.status === 'open' ? 'destructive' : 'default'}>
                                        {thread.status}
                                    </Badge>
                                    <p className="text-muted-foreground">
                                        {format(new Date(thread.updated_at), 'MMM dd')}
                                    </p>
                                </div>
                            </div>
                        ))}
                        {threads.length === 0 && (
                            <p className="text-center text-muted-foreground py-4">No support tickets yet.</p>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card className="md:col-span-2">
                <CardHeader>
                    <CardTitle>{activeThread ? activeThread.subject : "Select a ticket"}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {activeThread ? (
                        <ChatWindow thread={activeThread} currentUser={user} />
                    ) : (
                        <div className="text-center p-20 text-muted-foreground">
                            Select a ticket from the left to view the conversation.
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}