import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Run, getRunDetails, RunDetails } from "@/lib/api";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader, FileText, Check, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function RunMonitorPage() {
  const { runId: urlRunId, evalId: urlEvalId } = useParams<{ runId: string; evalId: string }>();
  const navigate = useNavigate();
  
  // Store the actual evalId and runId values we'll use throughout the component
  const [runId, setRunId] = useState<string | null>(null);
  const [evalId, setEvalId] = useState<string | null>(null);
  
  const [runDetails, setRunDetails] = useState<RunDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);
  const pollInterval = useRef<NodeJS.Timeout | null>(null);

  // Determine the correct evalId and runId based on URL pattern
  useEffect(() => {
    // If we have a urlRunId but no urlEvalId, we're on the /runs/:runId route
    // We'll need to fetch the evalId from localStorage or the run details
    if (urlRunId && !urlEvalId) {
      setRunId(urlRunId);
      // First try to get evalId from localStorage
      const storedEvalId = localStorage.getItem("lastRunEvalId");
      if (storedEvalId && localStorage.getItem("lastRunId") === urlRunId) {
        // We have a matching evalId and runId in localStorage
        setEvalId(storedEvalId);
        addLog(`Initializing run monitor for run: ${urlRunId} with evaluation: ${storedEvalId}`);
      } else {
        // No valid evalId in localStorage
        addLog(`Initializing run monitor for run: ${urlRunId}`);
        // We'll handle missing evalId later
      }
    } 
    // If we have urlEvalId but no urlRunId, we're on the /evals/:evalId/run route
    else if (urlEvalId && !urlRunId) {
      setEvalId(urlEvalId);
      addLog(`Initializing run monitor for evaluation: ${urlEvalId}`);
      // We'll need to handle this case differently - perhaps we're expecting a new run
    }
    // If we have both, use both
    else if (urlEvalId && urlRunId) {
      setEvalId(urlEvalId);
      setRunId(urlRunId);
      addLog(`Initializing run monitor for evaluation: ${urlEvalId} and run: ${urlRunId}`);
    }
    // If we have neither, that's an error
    else {
      setError("Missing run ID or evaluation ID");
      setLoading(false);
    }
  }, [urlRunId, urlEvalId]);

  useEffect(() => {
    // Clean up the interval on unmount
    return () => {
      if (pollInterval.current) {
        clearInterval(pollInterval.current);
      }
    };
  }, []);

  // Scroll to bottom of logs whenever they update
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prevLogs) => [...prevLogs, `[${timestamp}] ${message}`]);
  };

  // Calculate progress percentage based on status
  const getProgressPercentage = () => {
    if (!runDetails) return 0;
    
    switch (runDetails.status) {
      case "completed":
        return 100;
      case "failed":
        return 100;
      case "in_progress":
        // Simulate progress when we don't have actual progress data
        return 50; 
      default:
        return 0;
    }
  };

  // Function to fetch run details from the API
  const fetchRunDetails = async () => {
    // Ensure we have both the run ID and eval ID before calling the API
    if (!runId) {
      setError("Missing run ID");
      setLoading(false);
      return;
    }

    if (!evalId) {
      setError("Missing evaluation ID. Please return to the evaluations page and try again.");
      setLoading(false);
      return;
    }
    
    try {
      const details = await getRunDetails(evalId, runId);
      
      // Add logs based on status changes
      if (!runDetails) {
        // First fetch
        addLog(`Run details fetched - ID: ${details.id}`);
        if (details.status === "in_progress") {
          addLog("Run is in progress...");
        } else if (details.status === "completed") {
          addLog("Run completed successfully!");
        } else if (details.status === "failed") {
          addLog(`Run failed. Error: ${details.error || "Unknown error"}`);
        }
      } else if (runDetails.status !== details.status) {
        // Status changed
        if (details.status === "completed") {
          addLog("Run completed successfully!");
          addLog(`Results: ${details.result_counts?.total || 0} total, ${details.result_counts?.passed || 0} passed`);
        } else if (details.status === "failed") {
          addLog(`Run failed. Error: ${details.error || "Unknown error"}`);
        }
      }
      
      // Update state with new details
      setRunDetails(details);
      setLoading(false);
      
      // Stop polling if the run is complete or failed
      if (details.status === "completed" || details.status === "failed") {
        if (pollInterval.current) {
          clearInterval(pollInterval.current);
          addLog("Polling stopped - run is in final state");
        }
      }
    } catch (error) {
      console.error("Failed to fetch run details:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      addLog(`Error fetching run details: ${errorMessage}`);
      setError(errorMessage);
      setLoading(false);
    }
  };

  // Start polling when component mounts - but only after we have both runId and evalId
  useEffect(() => {
    if (runId && evalId) {
      // Initial fetch
      fetchRunDetails();
      
      // Set up interval for polling (every 10 seconds)
      pollInterval.current = setInterval(fetchRunDetails, 10000);
      
      // Clean up
      return () => {
        if (pollInterval.current) {
          clearInterval(pollInterval.current);
        }
      };
    }
  }, [runId, evalId]);

  // Format timestamp to readable date
  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  // Get status icon based on run status
  const getStatusIcon = () => {
    if (!runDetails) return <Loader className="h-4 w-4 animate-spin" />;
    
    switch (runDetails.status) {
      case "completed":
        return <Check className="h-4 w-4 text-green-500" />;
      case "failed":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "in_progress":
        return <Loader className="h-4 w-4 animate-spin" />;
      default:
        return null;
    }
  };

  // Format status for display
  const formatStatus = (status: string) => {
    switch (status) {
      case "in_progress":
        return "In Progress";
      case "completed":
        return "Completed";
      case "failed":
        return "Failed";
      default:
        return status;
    }
  };

  return (
    <PageContainer
      title="Run Monitor"
      description="Track the progress of your evaluation run"
    >
      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Run Status</CardTitle>
            </CardHeader>
            <CardContent>
              {loading && !runDetails ? (
                <div className="space-y-4">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : error ? (
                <div className="rounded-md bg-destructive/15 p-4 text-destructive">
                  <p className="font-medium">Error fetching run details</p>
                  <p className="mt-1 text-sm">{error}</p>
                  
                  {error.includes("Missing evaluation ID") && (
                    <div className="mt-4 p-3 bg-muted rounded-md">
                      <p className="text-sm font-medium text-foreground">Troubleshooting:</p>
                      <ol className="text-sm text-foreground mt-2 pl-5 list-decimal">
                        <li>Go back to the Evaluations Library</li>
                        <li>Click on the evaluation that created this run</li>
                        <li>Click the "Run Eval" button again</li>
                      </ol>
                    </div>
                  )}
                  
                  <Button 
                    variant="outline" 
                    className="mt-4" 
                    onClick={() => navigate("/evals")}
                  >
                    Return to Evaluations
                  </Button>
                </div>
              ) : runDetails ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        {getStatusIcon()}
                        <Badge className={
                          runDetails.status === "completed" 
                            ? "bg-green-100 text-green-800" 
                            : runDetails.status === "failed" 
                              ? "bg-red-100 text-red-800" 
                              : "bg-blue-100 text-blue-800"
                        }>
                          {formatStatus(runDetails.status)}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Run ID: {runDetails.id}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">
                        {runDetails.status === "in_progress" ? "In Progress" : "Complete"}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Started: {formatDate(runDetails.created_at)}
                      </p>
                    </div>
                  </div>
                  <Progress value={getProgressPercentage()} className="h-2" />
                  
                  {runDetails.status === "completed" && runDetails.result_counts && (
                    <div className="grid grid-cols-4 gap-4 text-center">
                      <div className="rounded-md bg-muted p-3">
                        <p className="text-lg font-bold">{runDetails.result_counts.total}</p>
                        <p className="text-xs text-muted-foreground">Total</p>
                      </div>
                      <div className="rounded-md bg-green-100 p-3">
                        <p className="text-lg font-bold text-green-700">{runDetails.result_counts.passed}</p>
                        <p className="text-xs text-green-700">Passed</p>
                      </div>
                      <div className="rounded-md bg-red-100 p-3">
                        <p className="text-lg font-bold text-red-700">{runDetails.result_counts.failed}</p>
                        <p className="text-xs text-red-700">Failed</p>
                      </div>
                      <div className="rounded-md bg-orange-100 p-3">
                        <p className="text-lg font-bold text-orange-700">{runDetails.result_counts.errored}</p>
                        <p className="text-xs text-orange-700">Errors</p>
                      </div>
                    </div>
                  )}
                  
                  {runDetails.status === "completed" && (
                    <div className="flex justify-end">
                      <Button 
                        variant="outline" 
                        className="mr-2"
                        onClick={() => navigate(-1)}
                      >
                        Back
                      </Button>
                      <Button
                        onClick={() => navigate(`/runs/${runDetails.id}/results`)}
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        View Results
                      </Button>
                    </div>
                  )}
                  
                  {runDetails.status === "failed" && (
                    <div className="mt-4">
                      <p className="font-medium text-destructive">Error details:</p>
                      <p className="mt-1 text-sm bg-muted p-3 rounded-md">
                        {runDetails.error || "No error details available"}
                      </p>
                      <Button 
                        className="mt-4" 
                        variant="outline"
                        onClick={() => navigate(-1)}
                      >
                        Go Back
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-muted-foreground mb-4">
                    No run details available
                  </p>
                  <Button onClick={() => navigate(-1)}>
                    Go Back
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Log Console</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-80 rounded-md border bg-muted p-4">
                <div className="font-mono text-sm">
                  {logs.length > 0 ? (
                    logs.map((log, index) => (
                      <div key={index} className="pb-1">
                        {log}
                      </div>
                    ))
                  ) : (
                    <div className="text-muted-foreground">
                      Waiting for run to start...
                    </div>
                  )}
                  <div ref={logEndRef} />
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Run Information</CardTitle>
            </CardHeader>
            <CardContent>
              {loading && !runDetails ? (
                <div className="space-y-4">
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-4/5" />
                  <Skeleton className="h-5 w-3/5" />
                  <Skeleton className="h-5 w-full" />
                </div>
              ) : runDetails ? (
                <div className="space-y-4">
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">
                      Evaluation ID
                    </div>
                    <div className="font-mono text-sm">{runDetails.eval_id}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">
                      Run Name
                    </div>
                    <div>{runDetails.name}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">
                      Data Source
                    </div>
                    <div>
                      <Badge variant="outline" className="font-mono text-xs">
                        {runDetails.data_source?.source?.id || "Unknown"}
                      </Badge>
                    </div>
                  </div>
                  {runDetails.per_testing_criteria_results && (
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">
                        Testing Criteria
                      </div>
                      <div className="mt-1">
                        {runDetails.per_testing_criteria_results.map((criteria, index) => (
                          <div key={index} className="text-sm mb-1">
                            {criteria.testing_criteria}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {runDetails.report_url && (
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">
                        Report URL
                      </div>
                      <div className="text-sm truncate">{runDetails.report_url}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  No information available
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
