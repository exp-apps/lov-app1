import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getEvalRuns, EvalRun, getEvaluationDetails } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader, ArrowLeft, BarChart } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function EvalRunsPage() {
  const { evalId } = useParams<{ evalId: string }>();
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [lastRunId, setLastRunId] = useState<string | undefined>(undefined);
  const [evalName, setEvalName] = useState<string>("Loading evaluation...");
  
  const navigate = useNavigate();
  
  // Observer for infinite scrolling
  const loaderRef = useRef<HTMLDivElement>(null);
  
  // Intersection observer callback
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const target = entries[0];
      if (target.isIntersecting && hasMore && !loadingMore && !loading) {
        loadMoreRuns();
      }
    },
    [hasMore, loadingMore, loading]
  );
  
  // Set up the intersection observer
  useEffect(() => {
    const options = {
      root: null,
      rootMargin: "0px",
      threshold: 0.1,
    };
    
    const observer = new IntersectionObserver(handleObserver, options);
    const currentLoader = loaderRef.current;
    
    if (currentLoader) {
      observer.observe(currentLoader);
    }
    
    return () => {
      if (currentLoader) {
        observer.unobserve(currentLoader);
      }
      observer.disconnect();
    };
  }, [handleObserver]);

  // Initial data load
  useEffect(() => {
    const fetchEvalDetails = async () => {
      if (!evalId) return;
      
      try {
        const evalDetails = await getEvaluationDetails(evalId);
        setEvalName(evalDetails.name);
      } catch (error) {
        console.error("Failed to fetch evaluation details:", error);
      }
    };
    
    const fetchRuns = async () => {
      if (!evalId) return;
      
      try {
        setLoading(true);
        const data = await getEvalRuns(evalId);
        setRuns(data);
        
        // Set the last run ID for pagination
        if (data.length > 0) {
          const lastRun = data[data.length - 1];
          setLastRunId(lastRun.id);
        }
        
        // Check if we have reached the end of the list
        setHasMore(data.length === 8); // Assuming limit is 8
      } catch (error) {
        console.error("Failed to fetch runs:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchEvalDetails();
    fetchRuns();
  }, [evalId]);

  // Load more runs when scrolling
  const loadMoreRuns = async () => {
    if (!hasMore || loadingMore || !lastRunId || !evalId) return;
    
    try {
      setLoadingMore(true);
      
      const moreRuns = await getEvalRuns(evalId, lastRunId);
      
      if (moreRuns.length > 0) {
        // Add new runs to the existing list
        setRuns((prev) => [...prev, ...moreRuns]);
        
        // Update the last run ID for next pagination
        const newLastRun = moreRuns[moreRuns.length - 1];
        setLastRunId(newLastRun.id);
      }
      
      // Check if we have reached the end of the list
      setHasMore(moreRuns.length === 8); // Assuming limit is 8
    } catch (error) {
      console.error("Failed to load more runs:", error);
    } finally {
      setLoadingMore(false);
    }
  };

  // Filter runs based on search term
  const filteredRuns = runs.filter(
    (run) => run.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500">Completed</Badge>;
      case "in_progress":
        return <Badge className="bg-blue-500">In Progress</Badge>;
      case "failed":
        return <Badge className="bg-red-500">Failed</Badge>;
      default:
        return <Badge className="bg-gray-500">{status}</Badge>;
    }
  };

  const handleViewResults = (runId: string) => {
    navigate(`/runs/${runId}/results`);
  };

  const handleBackToEvals = () => {
    navigate('/evals');
  };

  return (
    <PageContainer
      title={evalName}
      description="View runs for this evaluation"
    >
      <div className="flex items-center gap-4 mb-6">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleBackToEvals}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Evaluations
        </Button>
        
        <Input
          placeholder="Search runs..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm ml-auto"
        />
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">Run Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Results</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRuns.length > 0 ? (
                filteredRuns.map((run) => (
                  <TableRow 
                    key={run.id} 
                    className="hover:bg-muted/50"
                  >
                    <TableCell className="font-medium">
                      {run.name}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(run.status)}
                    </TableCell>
                    <TableCell>
                      {run.result_counts ? (
                        <div className="flex flex-col text-sm">
                          <span>Passed: {run.result_counts.passed}</span>
                          <span>Failed: {run.result_counts.failed}</span>
                          <span>Errored: {run.result_counts.errored}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">No results</span>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(run.created_at)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate max-w-[200px]">
                      {run.data_source?.source?.id || 'N/A'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewResults(run.id)}
                        disabled={run.status !== "completed"}
                        className="flex items-center gap-2"
                      >
                        <BarChart className="h-4 w-4" />
                        View Results
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    {runs.length === 0 
                      ? "No runs found for this evaluation."
                      : "No runs match your search criteria."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          
          {/* Intersection observer target for infinite scrolling */}
          {!searchTerm && hasMore && (
            <div
              ref={loaderRef}
              className="w-full h-20 flex items-center justify-center"
            >
              {loadingMore ? (
                <div className="flex items-center gap-2">
                  <Loader className="h-5 w-5 animate-spin" />
                  <span className="text-sm text-muted-foreground">Loading more runs...</span>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Scroll down to load more runs
                </div>
              )}
            </div>
          )}
          
          {/* End of list message */}
          {!hasMore && runs.length > 0 && !loadingMore && (
            <div className="w-full py-4 text-center text-sm text-muted-foreground">
              End of runs list
            </div>
          )}
        </div>
      )}
    </PageContainer>
  );
} 