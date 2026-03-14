import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Menu, Settings, LogOut, PlusCircle, MessageSquare, Bot, Wifi, Trash2, Cpu, Database, Activity, Code2, AlertCircle, Mic, MicOff, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { marked } from 'marked';

// --- API Helper ---
const API_BASE = '/api';

async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers as Record<string, string>,
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('token');
      window.location.reload();
    }
    throw new Error(data.error || 'Erro na requisição');
  }

  return data;
}

// --- Types ---
interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  isStreaming?: boolean;
  isAudio?: boolean;
}

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

// --- Main App Component ---
function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!localStorage.getItem('token'));

  if (!isAuthenticated) {
    return <Login onLogin={() => setIsAuthenticated(true)} />;
  }

  return <ChatPanel onLogout={() => setIsAuthenticated(false)} />;
}

export default App;

// --- Login Component ---
function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { token } = await apiFetch<{ token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      localStorage.setItem('token', token);
      onLogin();
    } catch (err: any) {
      setError(err.message || 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass max-w-md w-full p-8 rounded-2xl shadow-xl relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary to-purple-400 opacity-50"></div>
        
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/20 text-primary mb-4 ring-1 ring-primary/30 shadow-[0_0_15px_rgba(167,139,250,0.5)]">
            <Bot size={32} />
          </div>
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
            Welcome to ClawCore
          </h1>
          <p className="text-gray-400 mt-2 text-sm">Enter your password to access the AI panel</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="glass-input w-full px-4 py-3 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 bg-red-400/10 p-3 rounded-lg text-sm border border-red-400/20">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary/90 text-white font-medium py-3 px-4 rounded-xl transition-all duration-200 shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {loading ? 'Authenticating...' : 'Access Panel'}
            {!loading && <Send size={18} />}
          </button>
        </form>
      </div>
    </div>
  );
}

// --- Chat Panel Component ---
function ChatPanel({ onLogout }: { onLogout: () => void }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  
  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Audio playback state
  const [playingMsgIdx, setPlayingMsgIdx] = useState<number | null>(null);
  const [loadingTtsIdx, setLoadingTtsIdx] = useState<number | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, []);

  // Load messages when conversation changes
  useEffect(() => {
    if (currentConvId) {
      loadMessages(currentConvId);
    } else {
      setMessages([]);
    }
  }, [currentConvId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadConversations = async () => {
    try {
      const data = await apiFetch<{ conversations: Conversation[] }>('/conversations');
      setConversations(data.conversations || []);
    } catch (err) {
      console.error('Failed to load conversations', err);
    }
  };

  const loadMessages = async (id: string) => {
    try {
      const data = await apiFetch<{ messages: any[] }>(`/conversations/${id}/messages`);
      const formatted = data.messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.createdAt,
      }));
      setMessages(formatted);
    } catch (err) {
      console.error('Failed to load messages', err);
    }
  };

  const createNewChat = async () => {
    try {
      const data = await apiFetch<{ conversation: Conversation }>('/conversations', { method: 'POST' });
      setConversations([data.conversation, ...conversations]);
      setCurrentConvId(data.conversation.id);
      setIsSidebarOpen(false); // Close sidebar on mobile
    } catch (err) {
      console.error('Failed to create chat', err);
    }
  };

  const deleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiFetch(`/conversations/${id}`, { method: 'DELETE' });
      setConversations(conversations.filter(c => c.id !== id));
      if (currentConvId === id) setCurrentConvId(null);
    } catch (err) {
      console.error('Failed to delete chat', err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    onLogout();
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const sendMessage = async (presetMessage?: string) => {
    const textToSend = presetMessage || input.trim();
    if (!textToSend || isStreaming) return;

    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setIsStreaming(true);

    // Initial user message and empty assistant message block
    setMessages(prev => [
      ...prev,
      { role: 'user', content: textToSend },
      { role: 'assistant', content: '', isStreaming: true }
    ]);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: textToSend,
          conversationId: currentConvId
        })
      });

      if (!response.ok) throw new Error('Falha ao enviar mensagem');
      if (!response.body) throw new Error('Resposta sem corpo legível');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      
      let assistantMessageContent = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              
              if (data.type === 'conv_id' && !currentConvId) {
                setCurrentConvId(data.conversationId);
                loadConversations(); // Refresh sidebar
              } else if (data.type === 'chunk') {
                assistantMessageContent += data.content;
                setMessages(prev => {
                  const newMsgs = [...prev];
                  newMsgs[newMsgs.length - 1] = { 
                    role: 'assistant', 
                    content: assistantMessageContent,
                    isStreaming: true 
                  };
                  return newMsgs;
                });
              } else if (data.type === 'done') {
                setIsStreaming(false);
                setMessages(prev => {
                  const newMsgs = [...prev];
                  newMsgs[newMsgs.length - 1] = { 
                    role: 'assistant', 
                    content: assistantMessageContent,
                    isStreaming: false 
                  };
                  return newMsgs;
                });
              } else if (data.type === 'error') {
                setIsStreaming(false);
                 setMessages(prev => [
                  ...prev,
                  { role: 'assistant', content: `**Error:** ${data.message}`, isStreaming: false }
                ]);
              }
            } catch (e) {
              console.error('Error parsing SSE row:', line, e);
            }
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      setIsStreaming(false);
      // Remove empty streaming message if it exists
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.isStreaming) {
          return [...prev.slice(0, -1), { role: 'assistant', content: `**System Error:** ${err.message}` }];
        }
        return prev;
      });
    }
  };

  // ── Voice recording logic
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        await transcribeAudio(blob);
      };
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    } catch {
      alert('Acesso ao microfone negado. Por favor, permita o uso do microfone.');
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    setIsRecording(false);
    setRecordingSeconds(0);
  }, []);

  const toggleRecording = useCallback(() => {
    if (isRecording) stopRecording(); else startRecording();
  }, [isRecording, startRecording, stopRecording]);

  const transcribeAudio = async (blob: Blob) => {
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'voice.webm');
      const token = localStorage.getItem('token');
      const res = await fetch('/api/voice', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
      const data = await res.json();
      if (data.text) {
        setInput(prev => prev ? `${prev} ${data.text}` : data.text);
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
        }
      }
    } catch { console.error('Transcription error'); }
    finally { setIsTranscribing(false); }
  };

  // ── TTS playback logic
  const playTTS = async (text: string, msgIdx: number) => {
    if (audioPlayerRef.current) { audioPlayerRef.current.pause(); audioPlayerRef.current = null; }
    if (playingMsgIdx === msgIdx) { setPlayingMsgIdx(null); return; }
    setLoadingTtsIdx(msgIdx);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ text }) });
      if (!res.ok) throw new Error('TTS failed');
      const audioBlob = await res.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioPlayerRef.current = audio;
      setPlayingMsgIdx(msgIdx);
      audio.onended = () => { setPlayingMsgIdx(null); URL.revokeObjectURL(audioUrl); };
      audio.onerror = () => { setPlayingMsgIdx(null); URL.revokeObjectURL(audioUrl); };
      await audio.play();
    } catch { setPlayingMsgIdx(null); }
    finally { setLoadingTtsIdx(null); }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar Overlay (Mobile) */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-20 md:hidden backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 w-72 glass border-r border-white/5 z-30 transform transition-transform duration-300 md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} flex flex-col`}>
        <div className="p-4 border-b border-white/5 flex gap-2">
          <button 
            onClick={createNewChat}
            className="flex-1 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white font-medium py-2.5 px-4 rounded-xl transition-all border border-white/5 shadow-sm"
          >
            <PlusCircle size={18} />
            Nova Conversa
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {conversations.map(conv => (
             <div 
              key={conv.id}
              onClick={() => { setCurrentConvId(conv.id); setIsSidebarOpen(false); }}
              className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all ${currentConvId === conv.id ? 'bg-primary/20 text-white border border-primary/30' : 'text-gray-400 hover:bg-white/5 hover:text-white border border-transparent'}`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <MessageSquare size={16} className={currentConvId === conv.id ? 'text-primary' : ''} />
                <span className="truncate text-sm font-medium">{conv.title}</span>
              </div>
              <button 
                onClick={(e) => deleteChat(conv.id, e)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-colors"
                title="Deletar"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-white/5 space-y-2 text-sm text-gray-400">
           <button 
              onClick={() => setShowStatus(true)}
              className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 hover:text-white transition-all text-left"
            >
              <Cpu size={18} />
              Status do Sistema
            </button>
            <button 
              onClick={handleLogout}
              className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 hover:text-white transition-all text-left"
            >
              <LogOut size={18} />
              Sair
            </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative min-w-0">
        {/* Header */}
        <header className="glass-header px-4 py-3 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
             <button 
                onClick={() => setIsSidebarOpen(true)}
                className="md:hidden p-2 rounded-lg hover:bg-white/10 text-gray-300 transition-colors"
              >
                <Menu size={20} />
              </button>
              <div className="font-semibold tracking-wide flex items-center gap-2">
                Claw<span className="text-primary font-bold">Core</span>
              </div>
          </div>
        </header>

        {/* Messages / Welcome View */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 flex justify-center custom-scrollbar">
          <div className="w-full max-w-3xl flex flex-col gap-6 py-8">
             {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 h-full text-center slide-up pt-12 pb-20">
                   <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/10 flex items-center justify-center text-primary mb-6 shadow-lg shadow-primary/10 border border-primary/20">
                      <Bot size={40} />
                   </div>
                   <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 mb-4">
                     Como posso ajudar hoje?
                   </h2>
                   <p className="text-gray-400 mb-8 max-w-md">Seu agente de IA pessoal está pronto para analisar código, rodar scripts ou responder perguntas.</p>
                   
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-lg">
                      {['Analyze my project architecture', 'Write a python script', 'What tools do you have?'].map((q, i) => (
                        <button
                          key={i}
                          onClick={() => sendMessage(q)}
                          className="glass p-4 rounded-xl text-left text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-colors border-white/5"
                        >
                          {q}
                        </button>
                      ))}
                   </div>
                </div>
             ) : (
                messages.map((msg, i) => (
                  <MessageBubble key={i} message={msg} msgIdx={i} onPlay={playTTS} isPlaying={playingMsgIdx === i} isLoadingTts={loadingTtsIdx === i} />
                ))
             )}
              {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
                 <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 border border-primary/30 mt-1">
                        <Bot size={16} className="text-primary" />
                    </div>
                    <div className="glass p-4 rounded-2xl rounded-tl-sm w-16 flex items-center justify-center gap-1.5 h-12">
                       <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{animationDelay: '0ms'}}></div>
                       <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{animationDelay: '150ms'}}></div>
                       <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{animationDelay: '300ms'}}></div>
                    </div>
                 </div>
              )}
              <div ref={messagesEndRef} />
          </div>
        </div>
 
        {/* Input Area */}
        <div className="p-4 bg-background border-t border-white/5 z-20">
           <div className="max-w-3xl mx-auto relative group">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleTextareaInput}
                onKeyDown={handleKeyDown}
                placeholder={isRecording ? `Gravando... (${recordingSeconds}s) — clique para parar` : isTranscribing ? 'Transcrevendo áudio...' : 'Message ClawCore...'}
                className={`w-full glass-input rounded-2xl pl-5 pr-28 py-4 max-h-48 resize-none text-white placeholder-gray-500 overflow-hidden shadow-2xl focus:shadow-[0_0_20px_rgba(167,139,250,0.15)] ${isRecording ? 'border border-red-500/40' : ''}`}
                rows={1}
                disabled={isStreaming || isRecording || isTranscribing}
              />
              <div className="absolute right-3 bottom-3 flex items-center gap-1.5">
                <button
                  id="voice-recording-btn"
                  onClick={toggleRecording}
                  disabled={isStreaming || isTranscribing}
                  title={isRecording ? `Parar gravação (${recordingSeconds}s)` : 'Gravar voz'}
                  className={`p-2 rounded-xl transition-all ${
                    isRecording 
                      ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/40' 
                      : isTranscribing
                        ? 'bg-yellow-500/20 text-yellow-400'
                        : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                  } disabled:opacity-50`}
                >
                  {isTranscribing ? <Loader2 size={18} className="animate-spin" /> : isRecording ? <MicOff size={18} /> : <Mic size={18} />}
                </button>
                <button
                  id="send-message-btn"
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || isStreaming}
                  className="p-2 rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:hover:bg-primary transition-colors"
                >
                  <Send size={18} />
                </button>
              </div>
           </div>
           <div className="text-center text-xs text-gray-500 mt-3 hidden md:block">
              ClawCore AI can make mistakes. Verify important information.
           </div>
        </div>
        
        {/* Status Modal */}
        {showStatus && <SystemStatusModal onClose={() => setShowStatus(false)} />}
      </div>
    </div>
  );
}

// --- Message Bubble Component ---
function MessageBubble({ message, msgIdx, onPlay, isPlaying, isLoadingTts }: { 
  message: Message, 
  msgIdx: number,
  onPlay: (text: string, idx: number) => void,
  isPlaying: boolean,
  isLoadingTts: boolean
}) {
  const isUser = message.role === 'user';
  
  // Render markdown with Marked
  const htmlContent = marked(message.content || '', { breaks: true }) as string;

  return (
    <div className={`flex items-start gap-4 ${isUser ? 'flex-row-reverse' : ''} slide-up`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border mt-1 shadow-sm ${
        isUser 
          ? 'bg-gradient-to-br from-gray-700 to-gray-800 border-gray-600' 
          : 'bg-primary/20 border-primary/30 text-primary'
      }`}>
         {isUser ? <span className="text-xs font-medium">U</span> : <Bot size={16} />}
      </div>
      
      <div className={`max-w-[85%] rounded-2xl px-5 py-4 shadow-sm relative group/bubble ${
        isUser
           ? 'bg-white/10 text-white rounded-tr-sm border border-white/5'
           : 'glass rounded-tl-sm text-gray-100 border border-white/5'
      }`}>
         {isUser ? (
           <div className="whitespace-pre-wrap">{message.content}</div>
         ) : (
           <>
             <div 
               className={`prose ${message.isStreaming ? 'typing-indicator-after' : ''}`}
               dangerouslySetInnerHTML={{ __html: htmlContent }} 
             />
             {!message.isStreaming && message.content && (
               <button
                 id={`play-tts-btn-${msgIdx}`}
                 onClick={() => onPlay(message.content, msgIdx)}
                 title={isPlaying ? 'Parar' : 'Ouvir resposta'}
                 className={`mt-2 flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-all ${
                   isPlaying 
                     ? 'bg-primary/30 text-primary' 
                     : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                 }`}
               >
                 {isLoadingTts ? <Loader2 size={12} className="animate-spin" /> : isPlaying ? <VolumeX size={12} /> : <Volume2 size={12} />}
                 <span>{isLoadingTts ? 'Gerando...' : isPlaying ? 'Parar' : 'Ouvir'}</span>
               </button>
             )}
           </>
         )}
      </div>
    </div>
  );
}

// --- Status Modal Component ---
function SystemStatusModal({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<any>(null);

  useEffect(() => {
    apiFetch('/status').then(data => setStatus(data)).catch(console.error);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm slide-up">
       <div className="glass w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl border border-white/10 relative">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary to-blue-500"></div>
          
          <div className="p-6 border-b border-white/5 flex justify-between items-center">
             <h2 className="text-xl font-bold flex items-center gap-2">
                <Activity className="text-primary" /> Status do Sistema
             </h2>
             <button onClick={onClose} className="p-1 hover:bg-white/10 text-gray-400 rounded-lg transition-colors">✕</button>
          </div>
          
          <div className="p-6">
            {!status ? (
              <div className="py-8 text-center text-gray-500 animate-pulse">Carregando métricas...</div>
            ) : (
               <div className="grid grid-cols-2 gap-4">
                  <StatusCard icon={<Wifi size={20}/>} label="Status" value="Online" color="text-green-400" />
                  <StatusCard icon={<Cpu size={20}/>} label="Uptime" value={`${status.uptime}s`} />
                  <StatusCard icon={<Database size={20}/>} label="RAM Usage" value={`${status.memory}MB`} />
                  <StatusCard icon={<Code2 size={20}/>} label="Skills" value={status.skills} />
                  <StatusCard icon={<Settings size={20}/>} label="Tools Configured" value={status.tools} />
                  <StatusCard icon={<MessageSquare size={20}/>} label="Total Msgs" value={status.messages} />
               </div>
            )}
            
            {status?.toolNames && (
              <div className="mt-6 pt-6 border-t border-white/5">
                 <h3 className="text-sm font-medium text-gray-400 mb-3">Loaded Tools</h3>
                 <div className="flex flex-wrap gap-2">
                    {status.toolNames.map((t: string) => (
                      <span key={t} className="px-2 py-1 text-xs bg-white/5 border border-white/10 rounded-md font-mono text-gray-300">
                        {t}
                      </span>
                    ))}
                 </div>
              </div>
            )}
          </div>
       </div>
    </div>
  );
}

function StatusCard({ icon, label, value, color = "text-primary" }: { icon: any, label: string, value: string|number, color?: string }) {
  return (
    <div className="bg-white/5 border border-white/5 p-4 rounded-xl flex items-center gap-4">
       <div className={`w-10 h-10 rounded-lg bg-black/30 flex items-center justify-center ${color}`}>
          {icon}
       </div>
       <div>
          <div className="text-xs text-gray-400 font-medium uppercase tracking-wider">{label}</div>
          <div className="text-lg font-semibold">{value}</div>
       </div>
    </div>
  )
}
