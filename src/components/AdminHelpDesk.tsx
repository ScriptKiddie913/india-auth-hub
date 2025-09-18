import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Send, Paperclip, Phone, CheckCircle, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ChatThread {
  id: string;
  user_id: string;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
  profiles?: {
    full_name: string;
  };
}

interface ChatMessage {
  id: string;
  thread_id: string;
  sender_id: string;
  content_type: string;
  content: string;
  created_at: string;
}

function AdminChatWindow({ thread, adminUserId }: { thread: ChatThread, adminUserId: string }) {
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
            setMessages(data || []);
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
                    sender_id: adminUserId,
                    content_type: contentType,
                    content: content
                });
            
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
    };

    return (
        <div className="flex flex-col h-[70vh]">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.sender_id === adminUserId ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-xs lg:max-w-md p-3 rounded-lg ${
                            msg.sender_id === adminUserId 
                                ? 'bg-blue-600 text-white' 
                                : msg.sender_id === 'system'
                                    ? 'bg-gray-100 text-gray-600'
                                    : 'bg-secondary text-secondary-foreground'
                        }`}>
                            {msg.content_type === 'text' && <p>{msg.content}</p>}
                            {msg.content_type === 'image' && (
                                <a href={msg.content} target="_blank" rel="noopener noreferrer">
                                    <img src={msg.content} className="max-w-full rounded-md" alt="Uploaded file"/>
                                </a>
                            )}
                            {msg.content_type === 'call_request' && (
                                <p className="flex items-center gap-2 font-semibold">
                                    <Phone className="w-4 h-4"/> User requested a call.
                                </p>
                            )}
                            {msg.content_type === 'system' && (
                                <p className="text-xs italic text-center w-full">{msg.content}</p>
                            )}
                            <p className="text-xs mt-1 opacity-75">{format(new Date(msg.created_at), 'p')}</p>
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
            <div className="border-t p-4 flex gap-2 items-center">
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />
                <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={isLoading}>
                    <Paperclip className="w-4 h-4"/>
                </Button>
                <Input 
                    value={newMessage} 
                    onChange={e => setNewMessage(e.target.value)} 
                    placeholder="Type your response..." 
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

export default function AdminHelpDesk() {
    const [threads, setThreads] = useState<ChatThread[]>([]);
    const [activeThread, setActiveThread] = useState<ChatThread | null>(null);
    const [filter, setFilter] = useState('open');
    const { toast } = useToast();

    const initializeAdminDesk = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('chat_threads')
                .select(`
                    *,
                    profiles:user_id (
                        full_name
                    )
                `)
                .eq(filter === 'all' ? 'status' : 'status', filter === 'all' ? filter : filter)
                .order('updated_at', { ascending: false });
            
            if (error) throw error;
            setThreads(data || []);
        } catch (error: any) {
            toast({
                title: "Error loading tickets",
                description: error.message,
                variant: "destructive"
            });
        }
    }, [filter, toast]);

    useEffect(() => {
        initializeAdminDesk();
        const interval = setInterval(initializeAdminDesk, 30000); // Refresh list every 30s
        return () => clearInterval(interval);
    }, [initializeAdminDesk]);

    const resolveThread = async (threadId: string) => {
        try {
            const { error } = await supabase
                .from('chat_threads')
                .update({ status: 'resolved' })
                .eq('id', threadId);
            
            if (error) throw error;
            
            await supabase
                .from('chat_messages')
                .insert({
                    thread_id: threadId,
                    sender_id: 'system',
                    content_type: 'system',
                    content: 'Thread marked as resolved by admin.'
                });
            
            initializeAdminDesk();
            if (activeThread?.id === threadId) {
                setActiveThread(null);
            }
            
            toast({
                title: "Thread resolved",
                description: "Support ticket has been marked as resolved."
            });
        } catch (error: any) {
            toast({
                title: "Error resolving thread",
                description: error.message,
                variant: "destructive"
            });
        }
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="md:col-span-1">
                <CardHeader>
                    <CardTitle>Support Tickets</CardTitle>
                    <div className="flex gap-2 pt-2">
                        <Button 
                            size="sm" 
                            variant={filter === 'open' ? 'default' : 'outline'} 
                            onClick={() => setFilter('open')}
                        >
                            Open
                        </Button>
                        <Button 
                            size="sm" 
                            variant={filter === 'resolved' ? 'default' : 'outline'} 
                            onClick={() => setFilter('resolved')}
                        >
                            Resolved
                        </Button>
                        <Button 
                            size="sm" 
                            variant={filter === 'all' ? 'default' : 'outline'} 
                            onClick={() => setFilter('all')}
                        >
                            All
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="max-h-[70vh] overflow-y-auto">
                    <div className="space-y-2">
                        {threads.map(thread => (
                            <div 
                                key={thread.id} 
                                onClick={() => setActiveThread(thread)} 
                                className={`p-3 border rounded-md cursor-pointer transition-colors ${
                                    activeThread?.id === thread.id ? 'bg-blue-100 border-blue-300' : 'hover:bg-secondary'
                                }`}
                            >
                                <p className="font-semibold">{thread.subject}</p>
                                <p className="text-sm text-muted-foreground truncate">
                                    {thread.profiles?.full_name || thread.user_id}
                                </p>
                                <div className="flex justify-between items-center text-xs mt-1">
                                    <Badge variant={thread.status === 'open' ? 'destructive' : 'default'}>
                                        {thread.status}
                                    </Badge>
                                    <p className="text-muted-foreground">
                                        {format(new Date(thread.updated_at), 'MMM dd, p')}
                                    </p>
                                </div>
                            </div>
                        ))}
                        {threads.length === 0 && (
                            <p className="text-center text-muted-foreground py-4">No tickets in this category.</p>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card className="md:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>{activeThread ? activeThread.subject : "Select a ticket"}</CardTitle>
                        {activeThread && (
                            <p className="text-sm text-muted-foreground">
                                {activeThread.profiles?.full_name || activeThread.user_id}
                            </p>
                        )}
                    </div>
                    {activeThread && activeThread.status === 'open' && (
                        <Button size="sm" variant="outline" onClick={() => resolveThread(activeThread.id)}>
                            <CheckCircle className="w-4 h-4 mr-2 text-green-600"/> 
                            Mark as Resolved
                        </Button>
                    )}
                </CardHeader>
                <CardContent className="p-0">
                    {activeThread ? (
                        <AdminChatWindow thread={activeThread} adminUserId="admin" />
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