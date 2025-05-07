import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
import { getEvaluations, getEvaluationDetails, Eval, ExternalEval } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader, ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";

export default function EvaluationsLibraryPage() {
  const [evaluations, setEvaluations] = useState<Eval[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [lastEvalId, setLastEvalId] = useState<string | undefined>(undefined);
  
  // Dialog state
  const [selectedEvalId, setSelectedEvalId] = useState<string | null>(null);
  const [evalDetails, setEvalDetails] = useState<ExternalEval | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  
  const navigate = useNavigate();
  
  // Observer for infinite scrolling
  const loaderRef = useRef<HTMLDivElement>(null);
  
  // Intersection observer callback
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const target = entries[0];
      if (target.isIntersecting && hasMore && !loadingMore && !loading) {
        loadMoreEvaluations();
      }
    },
    [hasMore, loadingMore, loading]
  );
  
  // Set up the intersection observer
  useEffect(() => {
    const options = {
      root: null,
      rootMargin: "200px",
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

  // Function to fetch evaluations
  const fetchEvaluations = async () => {
    try {
      console.log("About to fetch evaluations...");
      setLoading(true);
      
      // Send a test request to check if the API is available
      console.log("Sending test request to API");
      try {
        const testResponse = await fetch("http://localhost:8080/v1/evals?limit=1");
        console.log("Test API response status:", testResponse.status);
        if (testResponse.ok) {
          const testData = await testResponse.json();
          console.log("Test API data:", testData);
        } else {
          console.error("Test API request failed with status:", testResponse.status);
        }
      } catch (testError) {
        console.error("Test API request error:", testError);
      }
      
      // Now try the actual API call using our function
      const data = await getEvaluations();
      console.log("Evaluations API response:", data);
      setEvaluations(data);
      
      // Set the last eval ID for pagination
      if (data.length > 0) {
        const lastEval = data[data.length - 1];
        setLastEvalId(lastEval.id);
        setHasMore(data.length === 8); // Assuming limit is 8
      } else {
        // If no evaluations, disable pagination
        setHasMore(false);
      }
    } catch (error) {
      console.error("Failed to fetch evaluations:", error);
    } finally {
      setLoading(false);
    }
  };

  // Initial data load
  useEffect(() => {
    console.log("EvaluationsLibraryPage mounted - calling fetchEvaluations");
    fetchEvaluations();
  }, []);

  // Load more evaluations when scrolling
  const loadMoreEvaluations = async () => {
    if (!hasMore || loadingMore || !lastEvalId) return;
    
    try {
      setLoadingMore(true);
      console.log(`Loading more evaluations after ID: ${lastEvalId}`);
      
      const moreEvaluations = await getEvaluations(lastEvalId);
      console.log(`Loaded ${moreEvaluations.length} more evaluations`);
      
      if (moreEvaluations.length > 0) {
        // Add new evaluations to the existing list
        setEvaluations((prev) => [...prev, ...moreEvaluations]);
        
        // Update the last eval ID for next pagination
        const newLastEval = moreEvaluations[moreEvaluations.length - 1];
        setLastEvalId(newLastEval.id);
      }
      
      // Check if we have reached the end of the list
      setHasMore(moreEvaluations.length === 8); // Assuming limit is 8
    } catch (error) {
      console.error("Failed to load more evaluations:", error);
    } finally {
      setLoadingMore(false);
    }
  };

  // Handle clicking on the Run Eval button
  const handleRunEval = (e: React.MouseEvent, evalId: string) => {
    e.stopPropagation(); // Prevent row click from triggering
    navigate(`/evals/${evalId}/configure-run`);
  };

  // Handle clicking on a row to show details
  const handleRowClick = async (evalId: string) => {
    setSelectedEvalId(evalId);
    setLoadingDetails(true);
    setEvalDetails(null);
    
    try {
      const details = await getEvaluationDetails(evalId);
      console.log("Fetched evaluation details:", details);
      setEvalDetails(details);
    } catch (error) {
      console.error("Failed to fetch evaluation details:", error);
      toast.error("Failed to load evaluation details");
    } finally {
      setLoadingDetails(false);
    }
  };

  // Filter evaluations based on search term
  const filteredEvaluations = evaluations.filter(
    (evaluation) => evaluation.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (timestamp: number | string) => {
    const date = typeof timestamp === 'number' 
      ? new Date(timestamp * 1000)  // Unix timestamp (seconds)
      : new Date(timestamp);        // ISO string
      
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <PageContainer
      title="Evaluations Library"
      description="View and manage your evaluations"
    >
      <div className="flex items-center gap-4 mb-6">
        <Input
          placeholder="Search evaluations..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
        <Button asChild className="ml-auto">
          <a href="/evals/new">Create New Evaluation</a>
        </Button>
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
                <TableHead className="w-[300px]">Evaluation Name</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEvaluations.length > 0 ? (
                filteredEvaluations.map((evaluation) => (
                  <TableRow 
                    key={evaluation.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleRowClick(evaluation.id)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <ClipboardList className="h-4 w-4 text-muted-foreground" />
                        {evaluation.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {evaluation.model}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(evaluation.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => handleRunEval(e, evaluation.id)}
                        className="mr-2"
                      >
                        Run Eval
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent row click from triggering
                          navigate(`/evals/${evaluation.id}/runs`);
                        }}
                      >
                        View Runs
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    {searchTerm ? (
                      <div>
                        <p>No evaluations found matching "{searchTerm}"</p>
                        <Button 
                          variant="link" 
                          onClick={() => setSearchTerm("")}
                          className="mt-2"
                        >
                          Clear search
                        </Button>
                      </div>
                    ) : (
                      <div>
                        <p>No evaluations found</p>
                        <p className="text-sm text-muted-foreground mt-1">Create your first evaluation to get started</p>
                      </div>
                    )}
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
                  <span className="text-sm text-muted-foreground">Loading more evaluations...</span>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Scroll down to load more
                </div>
              )}
            </div>
          )}
          
          {/* End of list message */}
          {!hasMore && evaluations.length > 0 && !loadingMore && (
            <div className="w-full py-4 text-center text-sm text-muted-foreground">
              End of evaluations list
            </div>
          )}
        </div>
      )}

      {/* Evaluation Details Dialog */}
      <Dialog open={!!selectedEvalId} onOpenChange={(open) => !open && setSelectedEvalId(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {evalDetails?.name || "Evaluation Details"}
            </DialogTitle>
          </DialogHeader>
          
          {loadingDetails ? (
            <div className="flex flex-col gap-4 py-8">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : evalDetails ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">ID</h3>
                  <p className="font-mono text-sm">{evalDetails.id}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Created</h3>
                  <p>{formatDate(evalDetails.created_at)}</p>
                </div>
              </div>
              
              {evalDetails.testing_criteria.map((criteria, index) => (
                <div key={index}>
                  <h3 className="text-sm font-medium mb-2">Model Annotator</h3>
                  <div className="space-y-4">
                    <div className="flex justify-end">
                      <Badge variant="outline" className="font-mono text-xs">
                        {criteria.model}
                      </Badge>
                    </div>
                    
                    {criteria.input.map((input, inputIndex) => (
                      <div key={inputIndex} className="space-y-2">
                        {input.role === "developer" && (
                          <>
                            <div className="flex justify-between items-center">
                              <h4 className="text-sm font-medium">Taxonomy Prompt</h4>
                            </div>
                            <Textarea
                              value={input.content}
                              className="font-mono text-sm h-60 resize-none"
                              readOnly
                            />
                          </>
                        )}
                        
                        {input.role === "user" && (
                          <>
                            <h4 className="text-sm font-medium">Mapped Dataset Fields</h4>
                            <div className="bg-muted p-3 rounded-md">
                              <div className="text-sm whitespace-pre-wrap">
                                {input.content}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              
              {Object.keys(evalDetails.metadata).length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Metadata</h3>
                  <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">
                    {JSON.stringify(evalDetails.metadata, null, 2)}
                  </pre>
                </div>
              )}
              
              <div className="flex justify-end">
                <DialogClose asChild>
                  <Button variant="outline">Close</Button>
                </DialogClose>
                <Button 
                  className="ml-2" 
                  onClick={() => navigate(`/evals/${evalDetails.id}/configure-run`)}
                >
                  Run Eval
                </Button>
                <Button 
                  className="ml-2"
                  variant="secondary"
                  onClick={() => navigate(`/evals/${evalDetails.id}/runs`)}
                >
                  View Runs
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Failed to load evaluation details
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
} 