import { useState, useEffect } from 'react';
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
  const { connected, lastMessage, joinJob, leaveJob } = useWebSocket('http://localhost:3000');

  // Auto-join active jobs WebSocket rooms
  useEffect(() => {
    activeJobs.forEach(jobId => {
      joinJob(jobId);
    });

    return () => {
      activeJobs.forEach(jobId => {
        leaveJob(jobId);
      });
    };
  }, [activeJobs, joinJob, leaveJob]);

  useEffect(() => {
    if (lastMessage) {
      // Handle WebSocket messages to update job list
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
    }
  }, [lastMessage]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header connected={connected} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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