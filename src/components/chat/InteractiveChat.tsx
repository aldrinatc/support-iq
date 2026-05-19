'use client';

import { useState, useRef, useEffect, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useSearchParams } from 'next/navigation';
import { Send, Copy, Check, RotateCw, ThumbsUp, ThumbsDown, Download } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { detectWidgetQuery, type PersonaId, type QueryMatch } from '@/lib/query-detection';
import { getApiBasePath } from '@/lib/api-utils';
import { WidgetRenderer } from '@/components/widgets/WidgetRenderer';
import { useQuickAction } from '@/contexts/QuickActionContext';
import { useConversation, type Message } from '@/contexts/ConversationContext';
import { Avatar } from '@/components/ui/Avatar';
import type { Persona } from '@/types/persona';
// ClosedCaptions is available for accessibility features but not currently used
// import { ClosedCaptions } from '@/components/accessibility/ClosedCaptions';
import { useClosedCaptions } from '@/hooks/accessibility/useClosedCaptions';
import { ClientOnly } from '@/components/ui/ClientOnly';
import { ThinkingBlock } from '@/components/chat/ThinkingBlock';

interface InteractiveChatProps {
  persona?: Persona;
}

export interface InteractiveChatRef {
  submitQuery: (query: string) => void;
}

export const InteractiveChat = forwardRef<InteractiveChatRef, InteractiveChatProps>(function InteractiveChat({ persona }, ref) {
  // Use shared conversation context
  const { messagesByPersona, setMessagesByPersona } = useConversation();

  const [inputValue, setInputValue] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isTyping, setIsTyping] = useState(false); // Keep for backward compatibility
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const [displayedText, setDisplayedText] = useState<Record<string, string>>({});
  const [showThinking, setShowThinking] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [forceScroll, setForceScroll] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { quickActionQuery } = useQuickAction();
  const searchParams = useSearchParams();

  // Accessibility features
  const { updateCaption, clearCaption } = useClosedCaptions(true); // CC enabled by default

  // Get current persona ID (memoized to ensure it updates when persona changes)
  const personaId = useMemo(() => (persona?.id || 'cor') as PersonaId, [persona?.id]);

  // DEBUG: Log when persona changes
  useEffect(() => {
    console.log('[InteractiveChat] Persona changed to:', personaId);
    console.log('[InteractiveChat] All messages by persona:', messagesByPersona);
    console.log('[InteractiveChat] Current persona messages count:', (messagesByPersona[personaId] || []).length);
  }, [personaId, messagesByPersona]);

  // Scroll to top when switching to a persona with no messages
  useEffect(() => {
    const currentMessages = messagesByPersona[personaId] || [];
    if (currentMessages.length === 0 && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = 0;
      console.log('[InteractiveChat] Scrolled to top (no messages for this persona)');
    }
  }, [personaId, messagesByPersona]);

  // Get current persona's messages
  const messages = useMemo(() => messagesByPersona[personaId] || [], [messagesByPersona, personaId]);

  // Helper to update current persona's messages
  const setMessages = useCallback((updater: Message[] | ((prev: Message[]) => Message[])) => {
    setMessagesByPersona(prev => {
      const currentMessages = prev[personaId] || [];
      const newMessages = typeof updater === 'function' ? updater(currentMessages) : updater;
      console.log('[InteractiveChat] Updating messages for persona:', personaId, 'New count:', newMessages.length);
      return { ...prev, [personaId]: newMessages };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId]);

  // Expose submitQuery method via ref
  useImperativeHandle(ref, () => ({
    submitQuery: (query: string) => {
      processQuery(query);
    },
  }));

  // Process a query string (used by both form submit and ref call)
  const processQuery = async (query: string) => {
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: query,
      timestamp: new Date(),
    };

    // Add user message
    setMessages((prev) => [...prev, userMessage]);

    // Force scroll for user-initiated actions (even if they were scrolled up)
    setForceScroll(true);

    // Find matching response using persona-aware query detection
    const personaId = (persona?.id || 'cor') as PersonaId;
    const match = detectWidgetQuery(query, personaId);

    if (match) {
      await handleMatch(match, query);
    } else {
      // No match found - show thinking animation then helpful response

      // Show thinking indicator for 2 seconds
      setShowThinking(true);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Hide thinking block
      setShowThinking(false);

      const fallbackMessage: Message = {
        id: `ai-${Date.now()}`,
        type: 'ai',
        content:
          "I'm not sure I understood that. Try asking about:\n- Executive summary\n- Analytics\n- Acme Corp risk\n- Sentiment analysis\n- Escalation path\n- SLA performance\n- Schedule a meeting",
        timestamp: new Date(),
        userQuery: query,
      };
      setMessages((prev) => [...prev, fallbackMessage]);
    }
  };

  // Detect if user is at bottom of scroll container
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

      // Consider "at bottom" if within 100px
      const atBottom = distanceFromBottom < 100;
      setIsAtBottom(atBottom);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Simple, clean auto-scroll: scroll to bottom when messages change
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    console.log('[InteractiveChat] Messages changed, count:', messages.length);
    console.log('[InteractiveChat] isAtBottom:', isAtBottom, 'forceScroll:', forceScroll);

    // Scroll if: user is at bottom OR this is a forced scroll (user sent a message)
    if (isAtBottom || forceScroll) {
      // Double requestAnimationFrame ensures DOM and layout are fully updated
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight;

          console.log('[InteractiveChat] Scrolled to bottom, height:', container.scrollHeight);

          // Reset forceScroll flag after scrolling
          if (forceScroll) {
            setForceScroll(false);
          }
        });
      });
    } else {
      console.log('[InteractiveChat] User scrolled up, not auto-scrolling');
    }
  }, [messages, isAtBottom, forceScroll]);

  // Handle URL query parameter (from dashboard widget clicks)
  useEffect(() => {
    const query = searchParams.get('query');
    if (query) {
      setInputValue(query);
      // Auto-submit after setting the value
      setTimeout(() => {
        const form = inputRef.current?.closest('form');
        form?.requestSubmit();
      }, 100);
    }
  }, [searchParams]);

  // Simulate realistic AI response with two-phase animation
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const simulateAIResponse = async (text: string): Promise<void> => {
    // Phase 1: Thinking (analyzing the query)
    setIsThinking(true);
    const thinkingDelay = 1500 + Math.random() * 500; // 1.5-2s
    await new Promise((resolve) => setTimeout(resolve, thinkingDelay));
    setIsThinking(false);

    // Phase 2: Composing (writing the response)
    setIsComposing(true);
    const composingDelay = 1500 + Math.random() * 1000; // 1.5-2.5s
    await new Promise((resolve) => setTimeout(resolve, composingDelay));
    setIsComposing(false);
  };

  // Typewriter effect - reveals text word by word
  const typewriterEffect = async (text: string, messageId: string): Promise<void> => {
    setTypingMessageId(messageId);

    // Split by words for smoother demo experience
    const words = text.split(' ');
    let currentText = '';

    for (let i = 0; i < words.length; i++) {
      currentText += (i > 0 ? ' ' : '') + words[i];
      setDisplayedText(prev => ({ ...prev, [messageId]: currentText }));

      // Update closed captions with current text
      updateCaption(currentText);

      // Speed: ~10-12 words per second (80-100ms per word)
      await new Promise(resolve => setTimeout(resolve, 85));
    }

    // Keep final caption displayed for 2 seconds, then clear
    await new Promise(resolve => setTimeout(resolve, 2000));
    clearCaption();

    // Clear typing state
    setTypingMessageId(null);

    // Mark message as fully typed
    setMessages(prev =>
      prev.map(msg =>
        msg.id === messageId ? { ...msg, isTyping: false } : msg
      )
    );
  };

  // Action handlers
  const handleCopy = (messageId: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedMessageId(messageId);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  const handleRegenerate = (query: string) => {
    // Find the last user message with this query
    const lastIndex = messages.findLastIndex(msg => msg.content === query && msg.type === 'user');
    if (lastIndex !== -1) {
      // Remove all messages after the user query
      setMessages(prev => prev.slice(0, lastIndex + 1));
      // Re-submit the query
      setTimeout(() => {
        const personaId = (persona?.id || 'cor') as PersonaId;
        const match = detectWidgetQuery(query, personaId);
        if (match) {
          handleMatch(match, query);
        }
      }, 100);
    }
  };

  const handleFeedback = (messageId: string, feedback: 'like' | 'dislike') => {
    setMessages(prev =>
      prev.map(msg =>
        msg.id === messageId
          ? { ...msg, feedback: msg.feedback === feedback ? undefined : feedback }
          : msg
      )
    );
  };

  const handleDownload = (content: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `response-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Helper to handle matched responses
  const handleMatch = async (match: QueryMatch, query: string) => {
    // Check if DEMO_MODE is enabled (from environment variable)
    const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

    if (isDemoMode) {
      // Show thinking indicator for 2 seconds
      setShowThinking(true);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Hide thinking block
      setShowThinking(false);

      // Create AI message with response text
      const responseText = match.responseText;
      const messageId = `ai-${Date.now()}`;
      const aiMessage: Message = {
        id: messageId,
        type: 'ai',
        content: responseText,
        timestamp: new Date(),
        userQuery: query,
        isTyping: true,
      };
      setMessages((prev) => [...prev, aiMessage]);

      // Typewriter effect - reveal text word by word
      await typewriterEffect(responseText, messageId);

      // Show widget after typing completes
      if (match.widgetType && match.widgetData) {
        console.log('[InteractiveChat] Widget detected:', match.widgetType);
        console.log('[InteractiveChat] Widget data:', match.widgetData);
        await new Promise((resolve) => setTimeout(resolve, 400));
        const widgetMessage: Message = {
          id: `widget-${Date.now()}`,
          type: 'widget',
          widgetType: match.widgetType,
          widgetData: match.widgetData,
          timestamp: new Date(),
        };
        console.log('[InteractiveChat] Adding widget message:', widgetMessage);
        setMessages((prev) => [...prev, widgetMessage]);
      }
    } else {
      // Use real API with SSE streaming and thinking states
      await handleAPIStreaming(query, match);
    }
  };

  // Handle real API streaming with thinking states
  const handleAPIStreaming = async (query: string, match?: QueryMatch) => {
    try {
      // Show initial thinking state
      // TODO: Re-enable thinking state when implemented
      // setThinkingState({
      //   isVisible: true,
      //   state: 'analyzing',
      //   text: 'Analyzing your question...',
      // });

      const basePath = getApiBasePath();
      const response = await fetch(`${basePath}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: query }),
      });

      if (!response.ok) {
        throw new Error('API request failed');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No reader available');
      }

      let fullContent = '';
      const messageId = `ai-${Date.now()}`;
      let hasCreatedMessage = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);

            if (dataStr === '[DONE]') {
              // Hide thinking block
              setShowThinking(false);
              continue;
            }

            try {
              const data = JSON.parse(dataStr);

              // Handle thinking events
              if (data.type === 'thinking') {
                setShowThinking(true);
              }

              // Handle content streaming
              if (data.type === 'text') {
                fullContent = data.content;

                // Hide thinking block when content starts
                setShowThinking(false);

                if (!hasCreatedMessage) {
                  // Create the AI message
                  const aiMessage: Message = {
                    id: messageId,
                    type: 'ai',
                    content: fullContent,
                    timestamp: new Date(),
                    userQuery: query,
                    isTyping: false,
                  };
                  setMessages((prev) => [...prev, aiMessage]);
                  hasCreatedMessage = true;
                } else {
                  // Update existing message
                  setMessages(prev =>
                    prev.map(msg =>
                      msg.id === messageId ? { ...msg, content: fullContent } : msg
                    )
                  );
                }

                // Update closed captions
                updateCaption(fullContent);
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }

      // Clear caption after streaming completes
      await new Promise(resolve => setTimeout(resolve, 2000));
      clearCaption();

      // Show widget if detected
      if (match?.widgetType && match?.widgetData) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        const widgetMessage: Message = {
          id: `widget-${Date.now()}`,
          type: 'widget',
          widgetType: match.widgetType,
          widgetData: match.widgetData,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, widgetMessage]);
      }
    } catch (error) {
      console.error('API streaming error:', error);
      setShowThinking(false);

      const errorMessage: Message = {
        id: `ai-${Date.now()}`,
        type: 'ai',
        content: 'Sorry, I encountered an error processing your request. Please try again.',
        timestamp: new Date(),
        userQuery: query,
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const query = inputValue;
    setInputValue('');

    await processQuery(query);

    // Refocus input
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* Accessibility Controls - Temporarily hidden (can be re-enabled later) */}
      {/* <ClosedCaptions position="bottom" /> */}

      {/* Messages Container */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-6 py-6 pb-40">
        <ClientOnly fallback={<div className="pb-8"><div className="space-y-6" /></div>}>
          <div className="pb-8">
            {messages.length === 0 && !isThinking && !isComposing && (
              <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center max-w-3xl mx-auto">
                <h1 className="text-4xl md:text-5xl font-medium text-foreground mb-3">
                  AI-enhanced customer support services
                </h1>
                <p className="text-muted-foreground text-lg mb-8 max-w-md">
                  Saving costs and improving performance
                </p>
              </div>
            )}

            {/* Messages */}
            <div className="space-y-6">
            {messages.map((message) => (
              <div
                key={message.id}
                data-message-id={message.id}
                className={message.type !== 'widget' ? 'max-w-3xl mx-auto' : ''}
              >
                {message.type === 'user' && (
                  <div className="flex gap-3 justify-end" data-message-role="user">
                    <div className="max-w-2xl">
                      <div className="bg-primary text-primary-foreground px-4 py-3 rounded-2xl rounded-tr-sm">
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 text-right">
                        {message.timestamp.toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                    <Avatar
                      name={persona?.name || 'User'}
                      id={persona?.id}
                      size={32}
                      variant="chat"
                    />
                  </div>
                )}

                {message.type === 'ai' && (
                  <div className="flex gap-3 animate-in fade-in slide-in-from-left-2 duration-500" data-message-role="ai">
                    <div className="w-8 h-8 flex-shrink-0" />
                    <div className="max-w-2xl flex-1">
                      <div className="bg-gradient-to-br from-primary/8 via-accent/15 to-chart-3/10 rounded-2xl border border-primary/25 shadow-md overflow-hidden">
                        {/* Message Content */}
                        <div className="px-4 py-3">
                          <div className="text-sm text-foreground prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-headings:my-2">
                            {message.isTyping && typingMessageId === message.id ? (
                              <>
                                <ReactMarkdown>
                                  {displayedText[message.id] || ''}
                                </ReactMarkdown>
                                <span className="inline-block w-0.5 h-4 bg-primary ml-0.5 animate-pulse" />
                              </>
                            ) : (
                              <ReactMarkdown>
                                {message.content || ''}
                              </ReactMarkdown>
                            )}
                          </div>
                        </div>

                        {/* Action Bar Footer - Only show when typing is complete */}
                        {!message.isTyping && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-background/40 border-t border-primary/10 animate-in fade-in duration-300 delay-150">
                        <button
                          onClick={() => handleCopy(message.id, message.content!)}
                          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                          title="Copy to clipboard"
                        >
                          {copiedMessageId === message.id ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-success" />
                              <span className="text-success">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>

                        {message.userQuery && (
                          <button
                            onClick={() => handleRegenerate(message.userQuery!)}
                            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                            title="Regenerate response"
                          >
                            <RotateCw className="h-3.5 w-3.5" />
                            <span>Regenerate</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleDownload(message.content!)}
                          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                          title="Download response"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>Download</span>
                        </button>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleFeedback(message.id, 'like')}
                            className={`rounded-md p-1.5 transition-colors ${
                              message.feedback === 'like'
                                ? 'bg-success/10 text-success'
                                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                            }`}
                            title="Good response"
                          >
                            <ThumbsUp className={`h-3.5 w-3.5 ${message.feedback === 'like' ? 'fill-current' : ''}`} />
                          </button>
                          <button
                            onClick={() => handleFeedback(message.id, 'dislike')}
                            className={`rounded-md p-1.5 transition-colors ${
                              message.feedback === 'dislike'
                                ? 'bg-destructive/10 text-destructive'
                                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                            }`}
                            title="Poor response"
                          >
                            <ThumbsDown className={`h-3.5 w-3.5 ${message.feedback === 'dislike' ? 'fill-current' : ''}`} />
                          </button>
                        </div>

                        <span className="ml-auto text-xs text-muted-foreground">
                          {message.timestamp.toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {message.type === 'widget' && message.widgetData && (
                  <div className="flex gap-3 -mx-6">
                    <div className="w-8 h-8 flex-shrink-0 ml-6" />
                    <div className="flex-1 pr-6">
                      <WidgetRenderer
                        type={message.widgetType!}
                        data={message.widgetData}
                        onAction={(action) => processQuery(action)}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Simple Thinking Block */}
            {showThinking && (
              <div className="flex gap-3 max-w-3xl mx-auto">
                <div className="w-8 h-8 flex-shrink-0" />
                <div className="flex-1">
                  <ThinkingBlock isVisible={showThinking} />
                </div>
              </div>
            )}

            {/* Legacy Phase 1: Thinking Indicator (kept for backward compatibility) */}
            {isThinking && !showThinking && (
              <div className="flex gap-3">
                <div className="w-8 h-8 flex-shrink-0" />
                <div className="flex items-center gap-2 px-4 py-3">
                  <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                  <span className="text-sm text-muted-foreground italic animate-pulse">
                    Analyzing your question...
                  </span>
                </div>
              </div>
            )}

            {/* Legacy Phase 2: Composing Indicator (kept for backward compatibility) */}
            {isComposing && !showThinking && (
              <div className="flex gap-3">
                <div className="w-8 h-8 flex-shrink-0" />
                <div className="bg-gradient-to-br from-primary/8 via-accent/15 to-chart-3/10 rounded-2xl border border-primary/25 shadow-md overflow-hidden animate-in fade-in duration-300">
                  <div className="px-4 py-3">
                    {/* Skeleton lines with shimmer effect */}
                    <div className="space-y-2">
                      <div className="h-3 bg-primary/20 rounded animate-pulse w-full" />
                      <div className="h-3 bg-primary/20 rounded animate-pulse w-5/6" />
                      <div className="h-3 bg-primary/20 rounded animate-pulse w-4/6" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div ref={messagesEndRef} />
          </div>
        </ClientOnly>
      </div>

      {/* Input Area - Fixed at bottom, centered */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background to-transparent pt-6 pb-8 px-6">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="What would you like to do?"
              className="flex-1 px-4 py-3.5 bg-card border border-border/50 rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 shadow-lg"
              disabled={isThinking || isComposing}
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isThinking || isComposing}
              className="px-6 py-3.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg flex items-center gap-2"
            >
              Send
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
});
