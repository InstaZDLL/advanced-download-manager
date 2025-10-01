import { useState, useEffect, useCallback } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DownloadForm } from './components/DownloadForm';
import { JobList } from './components/JobList';
import { Header } from './components/Header';
import { useWebSocket } from './hooks/useWebSocket';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function AppContent() {
  const [activeJobs, setActiveJobs] = useState(new Set<string>());
  const { connected, serverAvailable, lastMessage, joinJob, leaveJob } = useWebSocket((import.meta.env.VITE_API_URL as string) || 'http://localhost:3000');

  // Simple toast notifications
  const [toasts, setToasts] = useState<Array<{ id: string; type: 'success' | 'error'; message: string }>>([]);
  const pushToast = (t: { id: string; type: 'success' | 'error'; message: string }) => {
    setToasts(prev => [...prev, t]);
    // auto-dismiss after 5s
    setTimeout(() => {
      setToasts(prev => prev.filter(x => x.id !== t.id));
    }, 5000);
  };
  const dismissToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  // Auto-join active jobs WebSocket rooms; re-join on reconnect
  useEffect(() => {
    if (!connected) return;
    activeJobs.forEach(jobId => {
      joinJob(jobId);
    });
    return () => {
      if (!connected) return;
      activeJobs.forEach(jobId => {
        leaveJob(jobId);
      });
    };
  }, [activeJobs, joinJob, leaveJob, connected]);

  useEffect(() => {
    if (lastMessage) {
      // Handle WebSocket messages to update job list
      queryClient.invalidateQueries({ queryKey: ['downloads'] });

      // Toasts for terminal events
      if (lastMessage.type === 'completed') {
        const d = lastMessage.data as { jobId: string; filename: string };
        pushToast({ id: `ok-${d.jobId}`, type: 'success', message: `Terminé: ${d.filename}` });
        // Remove from active jobs when completed
        setActiveJobs(prev => {
          const next = new Set(prev);
          next.delete(d.jobId);
          return next;
        });
      }
      if (lastMessage.type === 'failed') {
        const d = lastMessage.data as { jobId: string; message: string };
        pushToast({ id: `ko-${d.jobId}`, type: 'error', message: `Échec: ${d.message}` });
        // Remove from active jobs when failed
        setActiveJobs(prev => {
          const next = new Set(prev);
          next.delete(d.jobId);
          return next;
        });
      }
    }
  }, [lastMessage]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header connected={connected} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Toasts */}
        {toasts.length > 0 && (
          <div className="fixed top-4 right-4 z-50 space-y-2">
            {toasts.map(t => (
              <div
                key={t.id}
                className={`flex items-start max-w-sm rounded-md shadow-lg border px-4 py-3 bg-white ${t.type === 'success' ? 'border-green-300' : 'border-red-300'}`}
              >
                <div className={`mt-0.5 mr-2 text-sm ${t.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                  {t.type === 'success' ? '✔' : '✖'}
                </div>
                <div className="text-sm text-gray-800">{t.message}</div>
                <button
                  onClick={() => dismissToast(t.id)}
                  className="ml-3 text-gray-400 hover:text-gray-600"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="space-y-8">
          {/* Download Form */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Add New Download
            </h2>
            <DownloadForm onJobCreated={(jobId) => setActiveJobs(prev => new Set([...prev, jobId]))} />
          </div>

          {/* Jobs List */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                Downloads
              </h2>
            </div>
            <JobList
              activeJobs={activeJobs}
              onJobUpdate={(jobId) => {
                // Remove from active jobs when completed or failed
                setActiveJobs(prev => {
                  const newSet = new Set(prev);
                  newSet.delete(jobId);
                  return newSet;
                });
              }}
              socketConnected={connected}
              serverAvailable={serverAvailable}
              onActiveJobsChange={useCallback((currentActive: Set<string>) => {
                // Merge with existing active jobs to keep joins for in-flight jobs
                setActiveJobs(prev => {
                  // Compute union and avoid state update if identical
                  const union = new Set<string>(prev);
                  for (const id of currentActive) union.add(id);
                  if (union.size === prev.size) {
                    // Check deep equality to prevent unnecessary updates
                    let identical = true;
                    for (const id of prev) {
                      if (!union.has(id)) { identical = false; break; }
                    }
                    if (identical) return prev; // no change
                  }
                  return union;
                });
              }, [])}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}

export default App;
