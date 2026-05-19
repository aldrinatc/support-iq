'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { QuickActionProvider, useQuickAction } from '@/contexts/QuickActionContext';
import { SidebarProvider } from '@/contexts/SidebarContext';
import { ConversationProvider, useConversation } from '@/contexts/ConversationContext';
import { PersonaProvider, usePersona } from '@/contexts/PersonaContext';
import { PersonaType } from '@/types/persona';
import { DemoLoadingSkeleton } from '@/components/layout/DemoLoadingSkeleton';

// Wrapper to check persona hydration and show skeleton
function HydrationGate({ children }: { children: React.ReactNode }) {
  const { isHydrated } = usePersona();

  // Show skeleton until persona context is fully hydrated
  if (!isHydrated) {
    return <DemoLoadingSkeleton />;
  }

  return <>{children}</>;
}

function DemoLayoutContent({ children }: { children: React.ReactNode }) {
  const { setQuickActionQuery } = useQuickAction();
  const { clearAllConversations, clearPersonaConversation } = useConversation();
  const { currentPersona } = usePersona();

  // HYDRATION FIX: Always start with consistent default, load from localStorage in useEffect
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isLayoutHydrated, setIsLayoutHydrated] = useState(false);

  // Load sidebar state from localStorage AFTER hydration
  useEffect(() => {
    const saved = localStorage.getItem('sidebarOpen');
    if (saved !== null) {
      setSidebarOpen(JSON.parse(saved));
    }
    setIsLayoutHydrated(true);
  }, []);

  // Save sidebar state to localStorage (only after hydration to prevent overwrite)
  useEffect(() => {
    if (!isLayoutHydrated) return;
    localStorage.setItem('sidebarOpen', JSON.stringify(sidebarOpen));
  }, [sidebarOpen, isLayoutHydrated]);

  // Keyboard shortcut: Cmd/Ctrl + B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setSidebarOpen((prev: boolean) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleQuickAction = (query: string) => {
    setQuickActionQuery(query);
  };

  const handleNewConversation = useCallback(() => {
    // Clear current persona's conversation
    clearPersonaConversation(currentPersona.id);
    console.log('[DemoLayout] Started new conversation for persona:', currentPersona.id);
  }, [clearPersonaConversation, currentPersona.id]);

  const handleResetData = () => {
    if (confirm('Reset all conversation data? This will clear all messages across all personas.')) {
      clearAllConversations();
      console.log('[DemoLayout] All conversations cleared');
    }
  };

  const handleUndo = async () => {
    try {
      console.log('[DemoLayout] Calling revert demo data webhook...');
      const response = await fetch('https://auzmor.app.n8n.cloud/webhook/revertDemoData', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        console.log('[DemoLayout] Demo data reverted successfully');
        // Optionally show a success message
        alert('Demo data has been reverted successfully!');
      } else {
        console.error('[DemoLayout] Failed to revert demo data:', response.statusText);
        alert('Failed to revert demo data. Please try again.');
      }
    } catch (error) {
      console.error('[DemoLayout] Error calling revert webhook:', error);
      alert('Error reverting demo data. Please check your connection.');
    }
  };

  return (
    <SidebarProvider
      value={{ sidebarOpen, toggleSidebar: () => setSidebarOpen(!sidebarOpen) }}
    >
      <div className="flex h-screen bg-background overflow-hidden">
        <Sidebar
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          onQuickAction={handleQuickAction}
          onNewConversation={handleNewConversation}
          onResetData={handleResetData}
          onUndo={handleUndo}
        />
        <div className="flex-1 flex flex-col overflow-hidden">{children}</div>
      </div>
    </SidebarProvider>
  );
}

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Extract persona ID from URL path (e.g., /demo/project-manager → project-manager)
  const personaId = pathname?.split('/').pop() as PersonaType | undefined;

  return (
    <PersonaProvider initialPersonaId={personaId}>
      <ConversationProvider>
        <QuickActionProvider>
          <HydrationGate>
            <DemoLayoutContent>{children}</DemoLayoutContent>
          </HydrationGate>
        </QuickActionProvider>
      </ConversationProvider>
    </PersonaProvider>
  );
}
