import { useEffect, useState, useRef, FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, Terminal as TerminalIcon, AlertTriangle, Check, Info, Settings, Loader2, GitBranch, Folder, Server } from "lucide-react";
import {
  useGetApiKeyStatus,
  useSetApiKey,
  useChat,
  useExecuteCommand,
  useExplainCommand,
  useSystemCheck,
  useGetContext,
  useGetHistory,
  useClearHistory,
  useGetRequirements,
  getGetContextQueryKey,
  getGetHistoryQueryKey,
  getGetRequirementsQueryKey,
  getGetApiKeyStatusQueryKey,
} from "@workspace/api-client-react";
import type { HistoryItem, SuggestedCommand, ChatResponse } from "@workspace/api-client-react/src/generated/api.schemas";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function ApiKeyModal({ onSuccess }: { onSuccess: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const { toast } = useToast();
  const setApiKeyMutation = useSetApiKey();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!apiKey) return;
    setApiKeyMutation.mutate(
      { data: { apiKey } },
      {
        onSuccess: (res) => {
          if (res.valid) {
            queryClient.invalidateQueries({ queryKey: getGetApiKeyStatusQueryKey() });
            onSuccess();
          } else {
            toast({ title: "Invalid API Key", variant: "destructive" });
          }
        },
        onError: () => toast({ title: "Failed to set API key", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
      <form onSubmit={handleSubmit} className="bg-background border border-primary/30 p-6 w-full max-w-md rounded-none shadow-[0_0_15px_rgba(57,255,20,0.2)]">
        <div className="flex items-center gap-3 mb-4">
          <TerminalIcon className="text-primary" />
          <h2 className="text-xl font-bold text-primary tracking-tight">SYSTEM_AUTH_REQUIRED</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Initialize AI Core. Enter your OpenAI API Key to grant network access.
        </p>
        <div className="relative mb-6">
          <Input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="pr-10 bg-black/50 border-primary/50 text-primary font-mono focus-visible:ring-primary rounded-none"
            autoFocus
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-primary/50 hover:text-primary transition-colors"
          >
            {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={setApiKeyMutation.isPending || !apiKey}
            className="rounded-none bg-primary text-black hover:bg-primary/90 font-bold"
          >
            {setApiKeyMutation.isPending ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
            AUTHENTICATE
          </Button>
        </div>
      </form>
    </div>
  );
}

function TerminalInterface() {
  const { data: apiKeyStatus, isLoading: isLoadingKey } = useGetApiKeyStatus({ query: { queryKey: getGetApiKeyStatusQueryKey() } });
  const { data: context } = useGetContext({ query: { queryKey: getGetContextQueryKey() } });
  const { data: history } = useGetHistory(undefined, { query: { queryKey: getGetHistoryQueryKey() } });
  
  const chatMutation = useChat();
  const executeMutation = useExecuteCommand();
  const explainMutation = useExplainCommand();
  
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ type: 'user' | 'ai' | 'command' | 'error' | 'success', text: string, command?: SuggestedCommand }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, history]);

  const handleCommandExecution = (command: SuggestedCommand, historyId?: number) => {
    executeMutation.mutate(
      { data: { command: command.command, confirmed: true, historyId } },
      {
        onSuccess: (res) => {
          queryClient.invalidateQueries({ queryKey: getGetHistoryQueryKey() });
          setMessages(prev => [
            ...prev,
            { type: res.success ? 'success' : 'error', text: res.stdout || res.stderr || (res.success ? "Command executed successfully." : "Command failed.") }
          ]);
        }
      }
    );
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || chatMutation.isPending) return;
    
    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { type: 'user', text: userMsg }]);
    
    chatMutation.mutate(
      { data: { message: userMsg, context } },
      {
        onSuccess: (res) => {
          setMessages(prev => [
            ...prev,
            { type: 'ai', text: res.response },
            ...res.commands.map(c => ({ type: 'command' as const, text: c.command, command: c }))
          ]);
        },
        onError: (err) => {
          setMessages(prev => [...prev, { type: 'error', text: "SYSTEM_FAILURE: Connection to AI Core lost." }]);
        }
      }
    );
  };

  if (isLoadingKey) return <div className="h-screen w-full bg-[#0d0d0d] flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="flex h-screen w-full bg-[#0d0d0d] text-foreground font-mono overflow-hidden">
      {!apiKeyStatus?.hasKey && <ApiKeyModal onSuccess={() => {}} />}
      
      {/* Main Terminal Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Status Bar */}
        <div className="h-8 border-b border-primary/20 flex items-center px-4 text-xs text-primary/70 justify-between bg-black/40">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1"><Folder size={12} /> {context?.cwd || '/system/root'}</span>
            {context?.gitInitialized && <span className="flex items-center gap-1 text-yellow-500"><GitBranch size={12} /> git:active</span>}
            {context?.nodeVersion && <span className="flex items-center gap-1 text-green-500"><Server size={12} /> node:{context.nodeVersion}</span>}
          </div>
          <div>AI_TERMINAL v1.0.0</div>
        </div>
        
        {/* Output Area */}
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-4 max-w-4xl mx-auto pb-8">
            <div className="text-primary/60 text-sm whitespace-pre-wrap">
              {`
   ___  ___   ________________  __  ________  _____   __ 
  / _ |/ _ | /_  __/ __/ __/  |/  |/  _/ __ \\/ __/ | / /
 / __ / __ |  / / / _// _// /|_/ // // /_/ / _/| |/ / 
/_/ |_/_/ |_| /_/ /___/_/ /_/  /_/___/\\____/___/|___/  
              `}
              <br/><br/>
              Welcome to AI Terminal. Type your intent naturally or execute commands.
            </div>
            
            {messages.map((msg, i) => (
              <div key={i} className={`flex flex-col gap-1 text-sm ${msg.type === 'user' ? 'opacity-80' : ''}`}>
                {msg.type === 'user' && <div className="text-white"><span className="text-primary font-bold">❯</span> {msg.text}</div>}
                {msg.type === 'ai' && <div className="text-cyan-400 pl-4 whitespace-pre-wrap border-l-2 border-cyan-400/30 py-1">{msg.text}</div>}
                {msg.type === 'success' && <div className="text-green-500 pl-4 whitespace-pre-wrap">{msg.text}</div>}
                {msg.type === 'error' && <div className="text-red-500 pl-4 whitespace-pre-wrap"><AlertTriangle className="inline mr-2" size={14} />{msg.text}</div>}
                
                {msg.type === 'command' && msg.command && (
                  <div className="bg-black/60 border border-primary/30 p-3 my-2 rounded-none ml-4 relative group">
                    {msg.command.isDangerous && (
                      <Badge variant="destructive" className="absolute -top-3 right-2 rounded-none">DANGEROUS</Badge>
                    )}
                    <div className="text-white font-mono mb-2 font-bold">{msg.command.command}</div>
                    <div className="text-muted-foreground text-xs mb-3">{msg.command.explanation}</div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="default" className="rounded-none h-7 bg-primary/20 text-primary hover:bg-primary/40 border border-primary/50" onClick={() => handleCommandExecution(msg.command!)}>
                        [RUN]
                      </Button>
                      <Button size="sm" variant="outline" className="rounded-none h-7 border-primary/20 text-primary/70 hover:bg-primary/10 hover:text-primary">
                        [EXPLAIN]
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {chatMutation.isPending && (
              <div className="text-cyan-400 pl-4 flex items-center gap-2">
                <Loader2 className="animate-spin" size={14} /> AI Processing...
              </div>
            )}
          </div>
        </ScrollArea>
        
        {/* Input Area */}
        <div className="p-4 border-t border-primary/20 bg-black/40">
          <form onSubmit={handleSubmit} className="flex items-center max-w-4xl mx-auto relative">
            <span className="absolute left-3 text-primary font-bold">❯</span>
            <Input 
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              className="w-full bg-transparent border-none text-white pl-8 focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/50 rounded-none h-12"
              placeholder="What do you want to do? (e.g. 'setup tailwind in this project')"
              autoFocus
              autoComplete="off"
              spellCheck="false"
            />
          </form>
        </div>
      </div>
      
      {/* Sidebar */}
      <div className="w-80 border-l border-primary/20 bg-black/60 flex flex-col hidden lg:flex">
        <div className="p-4 border-b border-primary/20 font-bold text-primary/80 uppercase tracking-widest text-xs">
          Command_History
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {history?.items?.length ? (
              history.items.map(item => (
                <div key={item.id} className="text-xs border border-primary/10 p-2 bg-black/40 relative">
                  <div className="text-primary/40 text-[10px] mb-1">{new Date(item.createdAt).toLocaleTimeString()}</div>
                  <div className="text-white truncate font-bold">{item.command || item.input}</div>
                  <div className={`mt-2 ${item.success ? 'text-green-500' : 'text-red-500'}`}>
                    {item.executed ? (item.success ? '[OK]' : '[FAILED]') : '[PENDING]'}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-primary/40 text-xs italic mt-10">No history found.</div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

function Router() {
  useEffect(() => { document.documentElement.classList.add('dark'); }, []);
  return (
    <Switch>
      <Route path="/" component={TerminalInterface} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
